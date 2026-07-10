import { type FastifyPluginAsync } from 'fastify'
import { CreatePromocodeBody, ApplyPromocodeBody } from '../../../types/promocode'
import { addPromocode, getPromocode, validatePromocode } from '../../../services/promocodeService'

/**
 * Route plugin mounted at /api/promocode (via @fastify/autoload directory structure)
 *
 * POST /api/promocode       — Create a promocode
 * POST /api/promocode/apply — Validate a promocode for a given user
 */
const promocodeRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  // ─── POST /api/promocode ──────────────────────────────────────────────────

  fastify.post<{ Body: CreatePromocodeBody }>(
    '/',
    {
      schema: {
        summary: 'Create a promocode',
        description: 'Adds a new promocode with an advantage and a set of restrictions.',
        tags: ['Promocode'],
        body: {
          type: 'object',
          required: ['name', 'advantage', 'restrictions'],
          properties: {
            name: { type: 'string' },
            advantage: {
              type: 'object',
              required: ['percent'],
              properties: {
                percent: { type: 'number', minimum: 0, maximum: 100 },
              },
            },
            restrictions: {
              type: 'array',
              items: { type: 'object' },
            },
          },
        },
        response: {
          201: {
            description: 'Promocode created successfully',
            type: 'object',
            properties: {
              name: { type: 'string' },
              advantage: {
                type: 'object',
                properties: { percent: { type: 'number' } },
              },
              restrictions: { type: 'array' },
            },
          },
          409: {
            description: 'Promocode already exists',
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, advantage, restrictions } = request.body
      try {
        const created = addPromocode({ name, advantage, restrictions })
        return reply.code(201).send(created)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return reply.code(409).send({ message })
      }
    }
  )

  // ─── POST /api/promocode/apply ────────────────────────────────────────────

  fastify.post<{ Body: ApplyPromocodeBody }>(
    '/apply',
    {
      schema: {
        summary: 'Apply a promocode',
        description: 'Validates a promocode against user arguments. Returns the discount if valid, or the list of reasons it is invalid.',
        tags: ['Promocode'],
        body: {
          type: 'object',
          required: ['promocode_name', 'arguments'],
          properties: {
            promocode_name: { type: 'string' },
            arguments: {
              type: 'object',
              required: ['age', 'town'],
              properties: {
                age: { type: 'integer', minimum: 0 },
                town: { type: 'string' },
              },
            },
          },
        },
        response: {
          200: {
            description: 'Promocode validation result',
            type: 'object',
            properties: {
              promocode_name: { type: 'string' },
              status: { type: 'string', enum: ['accepted', 'denied'] },
              advantage: {
                type: 'object',
                properties: { percent: { type: 'number' } },
              },
              reasons: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
          404: {
            description: 'Promocode not found',
            type: 'object',
            properties: { message: { type: 'string' } },
          },
          500: {
            description: 'Internal error (e.g. weather service unreachable)',
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { promocode_name, arguments: args } = request.body

      const promocode = getPromocode(promocode_name)
      if (!promocode) {
        return reply.code(404).send({
          message: `Promocode "${promocode_name}" not found`,
        })
      }

      try {
        const result = await validatePromocode(promocode, args)

        if (result.valid) {
          return reply.code(200).send({
            promocode_name,
            status: 'accepted',
            advantage: promocode.advantage,
          })
        } else {
          return reply.code(200).send({
            promocode_name,
            status: 'denied',
            reasons: result.reasons,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error'
        return reply.code(500).send({ message })
      }
    }
  )
}

export default promocodeRoutes
