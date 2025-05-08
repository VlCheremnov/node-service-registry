import { EventEmitTcpDataType } from './tcp'
import { VoteStatusEnum } from '../enums'

export interface LogEntry {
	index: number // порядковый номер записи (начинается с 1 и никогда не уменьшается)
	term: number // номер term-а, в котором лидер добавил эту запись
	cmd: EventEmitTcpDataType // произвольная команда
}

export interface StartElectionDataType {
	term: number
	lastLogIndex: number
	lastLogTerm: number
}

export interface RequestVoteDataType {
	status: VoteStatusEnum
}

export interface UpdateLeaderDataType {
	term: number
}
