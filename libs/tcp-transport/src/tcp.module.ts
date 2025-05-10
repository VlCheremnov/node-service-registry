import { DynamicModule, Global, Module } from '@nestjs/common'
import { TcpTransport } from './tcp.transport'
import { TcpModuleAsyncOptions, TcpOptions } from '@lib/tcp-transport/types'

@Global()
@Module({})
export class TcpModule {
	static forRoot(opts: TcpOptions): DynamicModule {
		return {
			module: TcpModule,
			providers: [
				{
					provide: TcpTransport,
					useValue: new TcpTransport(opts),
				},
			],
			exports: [TcpTransport],
		}
	}
	static forRootAsync(options: TcpModuleAsyncOptions): DynamicModule {
		const provider = {
			provide: TcpTransport,
			// фабрика, которая вызовет ваш useFactory, а затем создаст инстанс транспорта
			useFactory: async (...args: any[]) => {
				const opts = await options.useFactory(...args)
				console.log('useFactory', opts)
				return new TcpTransport(opts)
			},
			inject: options.inject || [],
		}

		return {
			module: TcpModule,
			imports: options.imports || [],
			providers: [provider],
			exports: [TcpTransport],
		}
	}
}
