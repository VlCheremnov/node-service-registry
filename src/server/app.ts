import Fastify from 'fastify'
import { PORT } from '../common/constants'
import routes from './routes'
import { RaftAgent } from '../common/utils/raftAgent'

export default async () => {
	const app = Fastify({ logger: true })

	app.register(routes)

	await app
		.listen({ port: PORT, host: '0.0.0.0' })
		.then(() => console.log(`Worker ${process.pid} listening on ${PORT}`))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})

	new RaftAgent()
}
