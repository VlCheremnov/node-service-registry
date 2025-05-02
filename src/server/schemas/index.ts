import { JSONSchemaType } from 'ajv'
import { ServiceInfo } from '../../common/types'

export interface GetServiceQuery {
	type?: string
	name?: string
}

export interface RegisterServiceBody
	extends Omit<ServiceInfo, 'lastHeartbeat' | 'serviceAvailable'> {}

export interface DeleteServiceParams {
	name: string
}

export const registerSchema: {
	schema: {
		body: JSONSchemaType<RegisterServiceBody>
	}
} = {
	schema: {
		body: {
			type: 'object',
			required: ['name', 'type', 'url'],
			properties: {
				name: { type: 'string', minLength: 1 },
				type: { type: 'string', minLength: 1 },
				url: { type: 'string', format: 'uri' },
				healthPath: { type: 'string', default: '/health' },
			},
		},
	},
} as const

export const getServiceSchema: {
	schema: {
		querystring: JSONSchemaType<GetServiceQuery>
	}
} = {
	schema: {
		querystring: {
			type: 'object',
			properties: {
				type: { type: 'string', nullable: true },
				name: { type: 'string', nullable: true },
			},
			required: [],
		},
	},
} as const

export const deleteServiceSchema: {
	schema: {
		params: JSONSchemaType<DeleteServiceParams>
	}
} = {
	schema: {
		params: {
			type: 'object',
			properties: {
				name: { type: 'string' },
			},
			required: ['name'],
		},
	},
} as const
