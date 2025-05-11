import { DynamicModule, Global, Module } from '@nestjs/common'
import { PeerManagementService } from './components/peer-management.service'
import { TcpTransport } from './tcp.transport'
import { TcpModuleAsyncOptions, TcpOptions } from '@lib/tcp-transport/types'
import { DataHandlerService } from '@lib/tcp-transport/components/data-handler.service'

@Global()
@Module({})
export class TcpModule {
	/** Static opts */
	// static forRoot(opts: TcpOptions): DynamicModule {
	// 	return {
	// 		module: TcpModule,
	// 		providers: [
	// 			PeerManagementService,
	// 			{ provide: 'TCP_OPTIONS', useValue: opts }, // ← кладём опции в контейнер
	// 			TcpTransport, // ← Nest создаст инстанс сам
	// 		],
	// 		exports: [TcpTransport],
	// 	}
	// }

	/** Async opts */
	static forRootAsync(options: TcpModuleAsyncOptions): DynamicModule {
		return {
			module: TcpModule,
			imports: options.imports || [],
			providers: [
				PeerManagementService,
				DataHandlerService,
				{
					provide: 'TCP_OPTIONS',
					useFactory: options.useFactory, // ← получаем opts из async-функции
					inject: options.inject || [],
				},
				// {
				// 	/** todo: export const TCP_HANDLERS = Symbol('TCP_HANDLERS') */
				// 	provide: 'TCP_HANDLERS',
				// 	useFactory: (transport: TcpTransport) => transport.handlers,
				// 	inject: [TcpTransport],
				// },
				// {
				// 	provide: 'TCP_TRANSFORM_TO_OBSERVABLE',
				// 	useFactory: (transport: TcpTransport) =>
				// 		transport.transformToObservable,
				// 	inject: [TcpTransport],
				// },
				TcpTransport,
			],
			exports: [TcpTransport],
		}
	}
}
