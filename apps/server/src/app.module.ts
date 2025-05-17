import { Module } from '@nestjs/common'
import { TcpModule } from '@lib/tcp-transport/tcp.module'
import { ConfigModule, ConfigService } from '@nestjs/config'
import defaultConfiguration from '@lib/shared/config'
import { GossipService } from './gossip/gossip.service'
import { AgentModule } from './agent/agent.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: true,
			load: [defaultConfiguration],
		}),
		TcpModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				host: configService.get<string>('tcpHost')!,
				port: configService.get<number>('tcpPort')!,
				peers: configService.get<string[]>('peers')!,
				sharedSecret: configService.get<string>('tcpSharedSecret')!,
				enableTLS: true,
				tls: {
					keyFileName: configService.get<string>('tlsKeyFileName')!,
					certFileName: configService.get<string>('tlsCertFileName')!,
					certPath: configService.get<string>('tlsCertPath'),
					caFileName: configService.get<string | undefined>('tlsCaFileName'),
					rejectUnauthorized: configService.get<boolean>(
						'tlsRejectUnauthorized'
					),
				},
			}),
		}),
		AgentModule,
	],
	controllers: [],
})
export class AppModule {}
