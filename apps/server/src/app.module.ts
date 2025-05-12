import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { TcpModule } from '@lib/tcp-transport/tcp.module'
import { ConfigModule, ConfigService } from '@nestjs/config'
import defaultConfiguration from '@lib/shared/config'

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
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
