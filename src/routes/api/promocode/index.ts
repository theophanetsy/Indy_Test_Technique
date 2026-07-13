import { type FastifyPluginAsync } from 'fastify'
import { CreatePromocodeBody } from '../../../types/promocode'
import { addPromocode } from '../../../services/promocodeService'

// POST /api/promocode — Create a promocode
const promocodeRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.post<{ Body: CreatePromocodeBody }>(
    '/',
    {
      schema: {
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
          500: {
            description: 'Internal server error',
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
        if (message.includes('already exists')) {
          return reply.code(409).send({ message })
        }
        return reply.code(500).send({ message })
      }
    }
  )
}

export default promocodeRoutes
