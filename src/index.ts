export type Device = {
	id: string
	label: string
}

export type Devices = {
	video: Device[]
	audio: Device[]
}

interface StreamFilter {
	apply(stream: MediaStream): void
}

export type LayoutConfiguration = {
	type: 'split' | 'picture-in-picture'
	container: 'round' | 'square' | 'original'
}

const videoType = ['webm', 'ogg', 'mp4'].find((type) =>
	MediaRecorder.isTypeSupported(`video/${type}`)
) as string

export class Celluloid extends EventTarget {
	#userStream!: MediaStream
	#displayStream!: MediaStream
	#mediaRecorder!: MediaRecorder
	#mediaURL!: string
	#filters: StreamFilter[] = []

	get userStream() {
		return this.#userStream
	}

	get displayStream() {
		return this.#displayStream
	}

	async getUserStream(
		audio: boolean | MediaTrackConstraints,
		video: boolean | MediaTrackConstraints
	) {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: typeof audio === 'string' ? { deviceId: audio } : audio,
			video:
				typeof video === 'string'
					? { deviceId: video }
					: video === true
					? { facingMode: 'user' }
					: false,
		})

		for (const filter of this.#filters) {
			filter.apply(stream)
		}

		this.#userStream = stream

		return stream
	}

	async getDisplayStream(
		audio: boolean | MediaTrackConstraints,
		video: boolean | MediaTrackConstraints
	) {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			audio: typeof audio === 'string' ? { deviceId: audio } : audio,
			video: typeof video === 'string' ? { deviceId: video } : video,
		})

		this.#displayStream = stream

		return stream
	}

	addFilter(filter: StreamFilter) {
		this.#filters.push(filter)
	}

	static async getMediaDevices() {
		const mediaDevices = await navigator.mediaDevices.enumerateDevices()
		const devices: Devices = {
			video: [],
			audio: [],
		}

		for (const device of mediaDevices) {
			if (device.kind === 'videoinput') {
				devices.video.push({
					id: device.deviceId,
					label: device.label || `Camera ${devices.video.length + 1}`,
				})
			} else {
				devices.audio.push({
					id: device.deviceId,
					label: device.label || `Mic ${devices.audio.length + 1}`,
				})
			}
		}

		return devices
	}

	record(stream: MediaStream) {
		this.#mediaRecorder = new MediaRecorder(stream, {
			mimeType: `video/${videoType}`,
		})
		const recordingChunks: Blob[] = []

		this.#mediaRecorder.onstop = () => {
			const blob = new Blob(recordingChunks, { type: `video/${videoType}` })
			this.#mediaURL = URL.createObjectURL(blob)
		}

		this.#mediaRecorder.ondataavailable = (e: BlobEvent) => {
			if (e.data.size > 0) {
				recordingChunks.push(e.data)
			}
		}

		this.#mediaRecorder.start()
	}

	stop() {
		this.#mediaRecorder.stop()
	}

	pause() {
		this.#mediaRecorder.pause()
	}

	resume() {
		this.#mediaRecorder.resume()
	}

	download(name = 'recording') {
		const a = document.createElement('a')
		a.style.display = 'none'
		a.href = this.#mediaURL
		URL.revokeObjectURL(this.#mediaURL)
		a.download = `${name}.${videoType}`
		document.body.appendChild(a)
		a.click()
		a.remove()
	}

	compose(
		streams: MediaStream[],
		layout: LayoutConfiguration = { type: 'split', container: 'original' }
	): MediaStream {
		const videos = streams.map((stream) => {
			const video = document.createElement('video')
			video.muted = true
			const mediaStream = new MediaStream([stream.getVideoTracks()[0]])
			video.srcObject = mediaStream
			video.play()
			return video
		})

		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')

		if (!ctx) {
			throw new Error('Could not get canvas context')
		}

		canvas.width = 1920
		canvas.height = 1080

		canvas.style.width = `${canvas.width / window.devicePixelRatio}`
		canvas.style.height = `${canvas.height / window.devicePixelRatio}`

		function renderFrame(
			ctx: CanvasRenderingContext2D,
			videos: HTMLVideoElement[]
		) {
			videos.forEach((video, index) => {
				if (video.readyState < video.HAVE_CURRENT_DATA) {
					return
				}

				ctx.save()
				if (index === 0) {
					ctx.drawImage(video, 0, 0)
				} else {
					ctx.translate(canvas.width / 2, canvas.height / 2)
					ctx.scale(0.5, 0.5)

					ctx.beginPath()
					const radius = Math.round(
						Math.min(video.videoWidth, video.videoHeight) / 2
					)
					const xOffset = video.videoWidth / 2
					const yOffset = video.videoHeight / 2
					ctx.arc(xOffset, yOffset, radius, 0, 2 * Math.PI)
					ctx.closePath()
					ctx.clip()
					ctx.drawImage(video, 0, 0)
				}
				ctx.restore()
			})
			requestAnimationFrame(() => renderFrame(ctx, videos))
		}

		requestAnimationFrame(() => renderFrame(ctx, videos))

		return canvas.captureStream()
	}
}
