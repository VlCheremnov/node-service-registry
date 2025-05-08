/* todo: Если кандидат или лидер обнаруживает, что его срок
 *   устарел, он немедленно возвращается в предыдущее состояние.
 *   Если сервер получает запрос с устаревшим номером срока, он отклоняет его. */

/* todo: Оставить два ивента RequestVote, AppendEntries (Heartbeat)*/

import { AutowireRaftEvents, RaftEvent } from './decorators'

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

import { RaftStateEnum, TcpTypesEnum, VoteStatusEnum } from '../../enums'
import {
	EventEmitTcpDataType,
	LogEntry,
	RequestVoteDataType,
	StartElectionDataType,
	UpdateLeaderDataType,
} from '../../types'
import { TcpAgent } from './../tcpAgent'
import { PEERS } from '../../constants'

@AutowireRaftEvents
export class RaftAgent {
	minElectionTime = 1_000
	maxElectionTime = 1_300
	appendElectionTime = 300

	electionTimeoutId?: NodeJS.Timeout

	peerLengths: number

	/** Любое состояние кластера */
	state = RaftStateEnum.Follower // Текущее состояние узла: 'follower', 'candidate' или 'leader'
	currentTerm = 0 // Номер последнего известного срока (терма). Увеличивается при каждых выборах и при получении сообщения с большим term.
	logs: LogEntry[] = [] // Последовательность записей { index, term, command }. Журнал команд, которые применит машина состояний.
	commitIndex = -1 // Максимальный индекс журнала, зафиксированный большинством и готовый к применению.
	lastApplied = -1 // Последний примененный индекс журнала на текущей машине

	currentLeaderId: string | null = null

	/** Для состояния "Лидер" */
	nextIndex: Record<string, number> = {} // «С какого индекса начинать отправку, чтобы выровнять журнал данного follower». Инициализируется lastLogIndex + 1  <id сокета, индекс>
	matchIndex: Record<string, number> = {} // 	«До какого индекса у follower уже точно есть такие же записи». Обновляется, когда приходит success =true.

	/** Для состояния "Кандидат" */
	votedForMe = 0

	/** На момент выборов (после окончания переменные должны обнуляться) */
	votedFor: string | null = null // ID кандидата, которому узел отдал голос в currentTerm (или null). Защищает правило «один узел — один голос в срок»

	constructor(public tcpAgent: TcpAgent) {
		this.tcpAgent.start()

		this.peerLengths = PEERS.length

		this.start()
	}

	private async start() {
		await sleep(3_000)
		this.resetElectionTimeout()

		setTimeout(() => {
			console.log('Установлены новые значения')
			this.minElectionTime = 4_000
			this.maxElectionTime = 4_300
		}, 0)
	}

	get quorum() {
		return this.peerLengths / 2 + 1
	}

	get lastLogIndex() {
		return this.logs.length - 1
	}
	/* todo: доработать логику */
	get lastLogTerm() {
		return this.logs.length - 1
	}

	resetState({ state = RaftStateEnum.Follower, term = this.currentTerm } = {}) {
		this.state = state
		this.currentTerm = term
		this.votedForMe = 0
		this.votedFor = null
	}

	private randomElectionTimeout() {
		return (
			this.minElectionTime +
			Math.random() * (this.maxElectionTime - this.minElectionTime)
		)
	}

	private stopElectionTimeout() {
		if (this.electionTimeoutId) clearTimeout(this.electionTimeoutId)
	}

	private resetElectionTimeout() {
		this.stopElectionTimeout()

		this.electionTimeoutId = setTimeout(() => {
			console.log('Таймер просрочен')
			this.startElection()

			/* Возобновляем выборы в случае, если голоса разделились */
			this.resetElectionTimeout()
		}, this.randomElectionTimeout())

		console.log(
			'Таймер запущен на время: ',
			this.randomElectionTimeout() / 1000 + 'с.'
		)
	}

	private startElection() {
		console.log('Данный кластер начал голосование')
		this.resetState({
			state: RaftStateEnum.Candidate,
			term: this.currentTerm + 1,
		})
		this.votedForMe = 1

		this.tcpAgent.broadcast({
			type: TcpTypesEnum.RequestVote,
			ts: Date.now(),
			data: {
				term: this.currentTerm,
				lastLogIndex: this.lastLogIndex,
				lastLogTerm: this.lastLogTerm,
			} as StartElectionDataType,
		})
	}

	@RaftEvent(TcpTypesEnum.Ping)
	protected pingTcp(req: EventEmitTcpDataType) {
		// console.log('data', data)
	}

	@RaftEvent(TcpTypesEnum.AppendEntries)
	protected appendEntries() {
		console.log('Запрос принят')
		this.resetElectionTimeout()
	}

	@RaftEvent(TcpTypesEnum.RequestVote)
	protected RequestVote(req: EventEmitTcpDataType<StartElectionDataType>) {
		// this.stopElectionTimeout()

		if (this.votedFor || !req.data) return

		const data: RequestVoteDataType = { status: VoteStatusEnum.Failed }

		const { term, lastLogTerm, lastLogIndex } = req.data

		if (
			term >= this.currentTerm &&
			lastLogTerm >= this.lastLogTerm &&
			lastLogIndex >= this.lastLogIndex
		) {
			data.status = VoteStatusEnum.Success
			this.votedFor = req.fromId
		}

		console.log('Сервис голосует: ', data.status)

		this.tcpAgent.sendToPeer(req.fromId, {
			type: TcpTypesEnum.VoteForLeader,
			ts: Date.now(),
			data,
		})
	}

	@RaftEvent(TcpTypesEnum.VoteForLeader)
	protected voteForLeader(req: EventEmitTcpDataType<RequestVoteDataType>) {
		/* Защита если лидер выбран, но данный кластер начал голосование */
		if (!req.data || this.state !== RaftStateEnum.Candidate) return

		if (req.data.status === VoteStatusEnum.Success) {
			this.votedForMe++
		}

		console.log('Принимает голос: ', this.votedForMe, '/', this.quorum)

		if (this.votedForMe >= this.quorum) {
			console.log('Обновляем лидера у всех')
			this.stopElectionTimeout()
			this.resetState({ state: RaftStateEnum.Leader })

			this.tcpAgent.broadcast({
				type: TcpTypesEnum.UpdateLeader,
				ts: Date.now(),
				data: {
					term: this.currentTerm,
				} as UpdateLeaderDataType,
			})

			this.startHeartbeat()
		}
	}

	@RaftEvent(TcpTypesEnum.UpdateLeader)
	protected updateLeader(req: EventEmitTcpDataType<UpdateLeaderDataType>) {
		console.log('Лидер обновлен: ', req.fromId)
		this.currentLeaderId = req.fromId
		this.resetState({ term: req.data?.term })
		this.resetElectionTimeout()
	}

	startHeartbeat() {
		this.heartbeat()
		this.electionTimeoutId = setInterval(
			this.heartbeat.bind(this),
			this.appendElectionTime
		)
	}

	heartbeat() {
		/* todo: Обновляем таймаут и одновременно обновляем журнал (если есть новые записи) у фоловеров */
		console.log('Запрос отправлен')
		this.tcpAgent.broadcast({
			type: TcpTypesEnum.AppendEntries,
			ts: Date.now(),
			data: {
				term: this.currentTerm,
			} as UpdateLeaderDataType,
		})
	}
}
