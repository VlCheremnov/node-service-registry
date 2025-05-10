import { DynamicModule, Global, Module } from '@nestjs/common'
import { PeerManagementProvider } from './components/peer-management.provider'
import { TcpTransport } from './tcp.transport'
import { TcpModuleAsyncOptions, TcpOptions } from '@lib/tcp-transport/types'

@Global()
@Module({})
export class TcpModule {
	/** Static opts */
	static forRoot(opts: TcpOptions): DynamicModule {
		return {
			module: TcpModule,
			providers: [
				PeerManagementProvider,
				{ provide: 'TCP_OPTIONS', useValue: opts }, // ← кладём опции в контейнер
				TcpTransport, // ← Nest создаст инстанс сам
			],
			exports: [TcpTransport],
		}
	}

	/** Async opts */
	static forRootAsync(options: TcpModuleAsyncOptions): DynamicModule {
		return {
			module: TcpModule,
			imports: options.imports || [],
			providers: [
				PeerManagementProvider,
				{
					provide: 'TCP_OPTIONS',
					useFactory: options.useFactory, // ← получаем opts из async-функции
					inject: options.inject || [],
				},
				TcpTransport,
			],
			exports: [TcpTransport],
		}
	}
}
