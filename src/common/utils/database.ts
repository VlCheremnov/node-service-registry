import { Level } from 'level'
import { LEVEL_DB_PATH } from '../constants'
import { ServiceInfo } from '../types'

export const servicesDB = new Level<string, string>(LEVEL_DB_PATH, {
	valueEncoding: 'utf8',
})

export const putService = (service: ServiceInfo) =>
	servicesDB.put(service.name, JSON.stringify(service))

export const delService = async (serviceName: string) =>
	servicesDB.del(serviceName)

export const getService = async (serviceName: string): Promise<ServiceInfo> => {
	const jsonService = await servicesDB.get(serviceName)

	if (!jsonService) {
		throw new Error('Service not found')
	}

	try {
		return JSON.parse(jsonService)
	} catch (err) {
		console.error(`Failed to parse value`, err)
		throw new Error('Failed to parse value')
	}
}

export const getServiceList = async (
	prefix?: string
): Promise<ServiceInfo[]> => {
	const services: ServiceInfo[] = []

	const iteratorOptions = prefix ? { gte: prefix, lt: prefix + '\xFF' } : {}

	for await (const [key, value] of servicesDB.iterator(iteratorOptions)) {
		try {
			services.push(JSON.parse(value))
		} catch (err) {
			console.warn(`Failed to parse value for key ${key}:`, err)
		}
	}

	return services
}
