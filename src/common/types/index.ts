export interface ServiceInfo {
	name: string
	type: string
	url: string
	healthPath: string
	lastHeartbeat: number
	serviceAvailable: boolean
}
