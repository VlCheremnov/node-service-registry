import Fastify from 'fastify'
import { PEERS, PORT, TCP_HOST } from '../common/constants'
import routes from './routes'
import { RaftAgent } from '../common/utils/raft/raftAgent'
import { TcpAgent } from '../common/utils/tcpAgent'

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

	new RaftAgent(new TcpAgent(TCP_HOST, PEERS))
}
