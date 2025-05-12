import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { TcpTransport } from '@lib/tcp-transport'
import { ConsoleLogger } from '@nestjs/common'

declare const module: any

async function bootstrap() {
	const ctx = await NestFactory.createApplicationContext(AppModule, {
		logger: console,
	})

	const transport = ctx.get(TcpTransport)

	const microservice = await NestFactory.createMicroservice(AppModule, {
		strategy: transport,
	})

	await microservice.listen()

	// if (module.hot) {
	// 	module.hot.accept()
	// 	module.hot.dispose(() => microservice.close())
	// }
}

async function bootstrapTestHttp() {
	const app = await NestFactory.create(AppModule, {
		logger: new ConsoleLogger({
			timestamp: true,
			compact: false,
		}),
	})
	const transport = app.get(TcpTransport)
	app.connectMicroservice({ strategy: transport })
	await app.startAllMicroservices()
	console.log('app.listen(80)')
	await app.listen(80)
}
bootstrapTestHttp()
