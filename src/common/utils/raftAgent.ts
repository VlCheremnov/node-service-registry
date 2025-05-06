/* todo: После выбора лидера все сервисы начинают беспорядочно выбирать нового лидера */

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

import { RaftStateEnum, TcpTypesEnum, VoteStatusEnum } from '../enums'
import {
	EventEmitTcpDataType,
	LogEntry,
	RequestVoteDataType,
	StartElectionDataType,
	UpdateLeaderDataType,
} from '../types'
import { TcpAgent } from './tcpAgent'
import { PEERS, TCP_HOST } from '../constants'

export class RaftAgent {
	tcpAgent: TcpAgent
	minElectionTime = 1_000
	maxElectionTime = 1_300

	state = RaftStateEnum.Follower // Текущее состояние узла: 'follower', 'candidate' или 'leader'
	currentTerm = 0 // Номер последнего известного срока (терма). Увеличивается при каждых выборах и при получении сообщения с большим term.
	votedForMe = 0
	votedFor: string | null = null // ID кандидата, которому узел отдал голос в currentTerm (или null). Защищает правило «один узел — один голос в срок»
	logs: LogEntry[] = [] // Последовательность записей { index, term, command }. Журнал команд, которые применит машина состояний.
	commitIndex = -1 // Максимальный индекс журнала, зафиксированный большинством и готовый к применению.
	lastApplied = -1 // Последний примененный индекс журнала на текущей машине

	currentLeaderId: string | null = null

	/** Только для лидера */
	nextIndex: Record<string, number> = {} // «С какого индекса начинать отправку, чтобы выровнять журнал данного follower». Инициализируется lastLogIndex + 1  <id сокета, индекс>
	matchIndex: Record<string, number> = {} // 	«До какого индекса у follower уже точно есть такие же записи». Обновляется, когда приходит success =true.
	/** **** */

	electionTimeoutId?: NodeJS.Timeout

	peerLengths: number

	constructor() {
		this.tcpAgent = new TcpAgent(TCP_HOST, PEERS)
		this.tcpAgent.start()

		this.peerLengths = PEERS.length

		this.start()
	}

	private async start() {
		await sleep(3_000)
		this.setEvents()
		this.resetElectionTimeout()

		setTimeout(() => {
			console.log('Установлены новые значения')
			this.minElectionTime = 40_000
			this.maxElectionTime = 40_300
		}, 0)
	}

	get quorum() {
		return this.peerLengths / 2 + 1
	}

	get lastLogIndex() {
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
			/* todo: Обновить состояние выборов */
			this.startElection()
			/** todo: если мы уже кандидат, а выборы не завершились, нужно запустить повторный раунд (split-vote) */
		}, this.randomElectionTimeout())

		console.log(
			'Таймер запущен на время: ',
			this.randomElectionTimeout() / 1000 + 'с.'
		)
	}

	/* todo: Добавить ничью и перезапустить выборы */
	private startElection() {
		console.log('Данный кластер начал голосование')
		this.resetState({
			state: RaftStateEnum.Candidate,
			term: this.currentTerm + 1,
		})
		this.votedForMe++

		this.tcpAgent.broadcast({
			type: TcpTypesEnum.RequestVote,
			ts: Date.now(),
			data: {
				term: this.currentTerm,
				commitIndex: this.commitIndex,
			} as StartElectionDataType,
		})
	}

	private setEvents() {
		console.log('Ивенты запущены')
		this.tcpAgent.on(TcpTypesEnum.Ping, this.pingTcp.bind(this))
		this.tcpAgent.on(TcpTypesEnum.PingRaft, this.pingRaft.bind(this))
		this.tcpAgent.on(TcpTypesEnum.RequestVote, this.requestVote.bind(this))
		this.tcpAgent.on(TcpTypesEnum.VoteForLeader, this.voteForLeader.bind(this))
		this.tcpAgent.on(TcpTypesEnum.UpdateLeader, this.updateLeader.bind(this))
	}

	private pingTcp(req: EventEmitTcpDataType) {
		// console.log('data', data)
	}

	private pingRaft(req: EventEmitTcpDataType) {
		this.resetElectionTimeout()
	}

	private requestVote(req: EventEmitTcpDataType<StartElectionDataType>) {
		this.stopElectionTimeout()

		if (this.votedFor || !req.data) return

		const data: RequestVoteDataType = { status: VoteStatusEnum.Success }

		if (this.commitIndex > req.data.commitIndex) {
			data.status = VoteStatusEnum.Failed
			this.votedFor = req.fromId
		}

		console.log('Сервис голосует: ', data.status)

		this.tcpAgent.sendToPeer(req.fromId, {
			type: TcpTypesEnum.VoteForLeader,
			ts: Date.now(),
			data,
		})
	}

	private voteForLeader(req: EventEmitTcpDataType<RequestVoteDataType>) {
		if (!req.data || this.state !== RaftStateEnum.Candidate) return

		if (req.data.status === VoteStatusEnum.Success) {
			this.votedForMe++
		}

		console.log('Принимает голос: ', this.votedForMe, '/', this.quorum)

		if (this.votedForMe >= this.quorum) {
			console.log('Обновляем лидера у всех')
			this.resetState({ state: RaftStateEnum.Leader })

			this.tcpAgent.broadcast({
				type: TcpTypesEnum.UpdateLeader,
				ts: Date.now(),
				data: {
					term: this.currentTerm,
				} as UpdateLeaderDataType,
			})
		}
	}

	updateLeader(req: EventEmitTcpDataType<UpdateLeaderDataType>) {
		console.log('Лидер обновлен: ', req.fromId)
		this.currentLeaderId = req.fromId
		this.resetState({ term: req.data?.term })
		// this.resetElectionTimeout()
	}

	heartbeat() {}
}
