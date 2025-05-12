import { decode, encode } from '@msgpack/msgpack'
import { MAX_BUFFER } from '@lib/tcp-transport/constants'

/** Версия протокола, в случае изменения сетевого протокола или формата сообщений поднять версию
 * Можно добавить совместимость со старыми версиями
 * */
const protocolVersion = 1

export function encodeFrame(obj: unknown): Buffer {
	const body = Buffer.from(encode(obj)) // ⬅️  оборачиваем
	const frame = Buffer.allocUnsafe(4 + 1 + body.length)

	frame.writeUInt32BE(body.length + 1, 0) // length
	frame.writeUInt8(protocolVersion, 4) // version
	body.copy(frame, 5) // теперь copy работает

	return frame
}

/** Декодирование. 1 сокет = 1 инстанс  */
export class FrameDecoderService {
	private buffer = Buffer.alloc(0)

	/* todo: при событии close надо очистить декодер */
	reset() {
		this.buffer = Buffer.alloc(0)
	}

	push(chunk: Buffer): unknown[] {
		this.buffer = this.buffer.length
			? Buffer.concat([this.buffer, chunk], this.buffer.length + chunk.length)
			: chunk

		/* защита от OOM / DDoS */
		if (this.buffer.length > MAX_BUFFER) {
			throw new Error('Inbound buffer overflow')
		}

		const messages: unknown[] = []

		while (this.buffer.length >= 4) {
			const len = this.buffer.readUInt32BE(0)
			if (this.buffer.length < 4 + len) break
			const version = this.buffer.readUInt8(4)
			if (version !== protocolVersion) throw new Error('Bad protocol version')

			const payload = this.buffer.subarray(5, 4 + len)
			messages.push(decode(payload))

			this.buffer = this.buffer.subarray(4 + len)
		}

		/* Buffer.from() создаёт новый буфер-копию ровно на размер хвоста (10 Б) и тем самым отпускает старый мегабайт. */
		if (this.buffer.length && this.buffer.length < 4096)
			this.buffer = Buffer.from(this.buffer)

		return messages
	}
}
