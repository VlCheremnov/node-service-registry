import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import {
	DeleteServiceParams,
	deleteServiceSchema,
	GetServiceQuery,
	getServiceSchema,
	RegisterServiceBody,
	registerSchema,
} from '../schemas'
import {
	deleteRegisterController,
	getServicesController,
	registerController,
} from '../controllers'

export default async function routes(
	fastify: FastifyInstance,
	opts: FastifyPluginOptions
) {
	/* Регистрируем сервис */
	fastify.post<{ Body: RegisterServiceBody }>(
		'/register',
		registerSchema,
		registerController
	)
	/* Удаление сервиса */
	fastify.delete<{ Params: DeleteServiceParams }>(
		'/register/:name',
		deleteServiceSchema,
		deleteRegisterController
	)
	/* Получение сервисов */
	fastify.get<{ Querystring: GetServiceQuery }>(
		'/services',
		getServiceSchema,
		getServicesController
	)
}
