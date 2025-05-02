import cluster from 'node:cluster'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { CLUSTER_INSTANCES } from '../common/constants'

export default async () => {
	if (cluster.isPrimary) {
		let workerLength = CLUSTER_INSTANCES || os.cpus().length

		if (workerLength < 2) {
			workerLength = 2
		}

		const distDir = dirname(fileURLToPath(import.meta.url))
		const workerPath = resolve(distDir, 'worker.js')

		for (let i = 0; i < workerLength; i++) {
			cluster.fork({
				WORKER_PATH: workerPath,
				workerLength,
				...process.env,
			})
		}

		cluster.on('exit', (worker, code, signal) => {
			console.error(
				`Worker ${worker.process.pid} died (${signal || code}). Respawning…`
			)
			cluster.fork({ WORKER_PATH: workerPath, workerLength, ...process.env })
		})
	} else {
		await import(process.env.WORKER_PATH || './worker.js')
	}
}
