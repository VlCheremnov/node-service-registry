import { ServiceInfo } from '../../common/types'
// import { producer } from '../utils/kafka'
import { KAFKA_TOPIC, REDIS_KEY, TTL_SEC } from '../../common/constants'
import { FastifyReply, FastifyRequest } from 'fastify'
import {
	RegisterServiceBody,
	GetServiceQuery,
	DeleteServiceParams,
} from '../schemas'

export const registerController = async (
	req: FastifyRequest,
	reply: FastifyReply
) => {
	const {
		name,
		type,
		url,
		healthPath = '/health',
	} = req.body as RegisterServiceBody

	const info: ServiceInfo = {
		name,
		type,
		url: url.replace(/\/$/, ''),
		healthPath: healthPath.startsWith('/') ? healthPath : `/${healthPath}`,
		lastHeartbeat: Date.now(),
		serviceAvailable: true,
	}

	// services.set(name, info)
	//
	// await safeJsonSet(REDIS_KEY(name), info, TTL_SEC)
	//
	// await publisher.publish(
	// 	'registry.events',
	// 	JSON.stringify({ action: 'added', svc: info })
	// )

	// await producer.send({
	// 	topic: KAFKA_TOPIC,
	// 	messages: [{ key: 'added', value: JSON.stringify(info) }],
	// })

	return reply.code(201).send({ ok: true })
}

export const deleteRegisterController = async (
	req: FastifyRequest,
	reply: FastifyReply
) => {
	const { name } = req.params as DeleteServiceParams

	// if (!services.has(name)) return reply.code(404).send({ error: 'not_found' })
	//
	// const service = services.get(name)
	//
	// services.delete(name)
	//
	// await safeDel(REDIS_KEY(name))
	//
	// await publisher.publish(
	// 	'registry.events',
	// 	JSON.stringify({ action: 'removed', name, service })
	// )

	// await producer.send({
	// 	topic: KAFKA_TOPIC,
	// 	messages: [{ key: 'removed', value: JSON.stringify({ name }) }],
	// })

	return reply.send({ ok: true })
}

export const getServicesController = async (
	req: FastifyRequest,
	reply: FastifyReply
) => {
	const { name, type } = req.query as GetServiceQuery

	// let serviceList = Array.from(services.values())
	//
	// if (type || name) {
	// 	serviceList = serviceList.filter((service) => {
	// 		const isType = type ? service.type === type : true
	// 		const isName = name ? service.name === name : true
	//
	// 		return isName && isType
	// 	})
	// }

	return reply.send([])
}
