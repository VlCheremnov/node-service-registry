import { decode, encode } from '@msgpack/msgpack'

/** Версия протокола, в случае изменения сетевого протокола или формата сообщений поднять версию */
/** Можно добавить совместимость со старыми версиями */
const protocolVersion = 1

export function encodeFrame(obj: unknown): Buffer {
	const body = Buffer.from(encode(obj)) // ⬅️  оборачиваем
	const frame = Buffer.allocUnsafe(4 + 1 + body.length)

	frame.writeUInt32BE(1 + body.length, 0) // length
	frame.writeUInt8(protocolVersion, 4) // version
	body.copy(frame, 5) // теперь copy работает

	return frame
}

/** Декодирование. 1 сокет = 1 инстанс  */
export class FrameDecoderService {
	private buffer = Buffer.alloc(0)
	/* защита от OOM / DDoS */
	private maxBuffer = 4 * 1024 * 1024

	push(chunk: Buffer): unknown[] {
		this.buffer = Buffer.concat([this.buffer, chunk])

		if (this.buffer.length > this.maxBuffer) {
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
		return messages
	}
}
