#!/usr/bin/env node

import { Command } from 'commander'
import startServer from './server/app'

const program = new Command()

program
	// .command('start')
	.description('Запустить приложение')
	.action(async () => startServer())

program
	.command('agent')
	.option('-d, --debug', 'Активировать режим отладки')
	.description('Собрать приложение')
	.action((options) => {
		console.log('build', options)
	})

program.parse(process.argv)
