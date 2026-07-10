import { type FastifyPluginAsync } from 'fastify'
import { ApplyPromocodeBody } from '../../../../types/promocode'
import { getPromocode, validatePromocode } from '../../../../services/promocodeService'

// POST /api/promocode/apply — Validate a promocode for a given user
const applyPromocodeRoute: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.post<{ Body: ApplyPromocodeBody }>(
    '/',
    {
      schema: {
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

export default applyPromocodeRoute
