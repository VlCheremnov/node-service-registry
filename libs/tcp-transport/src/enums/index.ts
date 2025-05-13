export enum TcpTypesEnum {
	Ping = 'ping',
	Default = 'emit',
	RegisteredSocket = 'register-socket',
	UpdateLeader = 'update-leader',
	VoteForLeader = 'vote-for-leader',
	Heartbeat = 'heartbeat',

	RequestVote = 'request-vote',
	AppendEntries = 'append-entries',
}
