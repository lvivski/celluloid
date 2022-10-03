type Device = {
	id: string
	label: string
}

type Devices = {
	video: Device[]
	audio: Device[]
}

interface StreamFilter {
	filter(stream: MediaStream): void
}

type LayoutConfiguration = {
	type: 'split' | 'picture-in-picture'
	container: 'round' | 'square' | 'original'
}

const videoType = ['webm', 'ogg', 'mp4'].filter(type => MediaRecorder.isTypeSupported(`video/${type}`))[0]

class Celluloid extends EventTarget {
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

	async getUserStream(audio: MediaTrackConstraints, video: MediaTrackConstraints) {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: typeof audio === 'string'
				? { deviceId: audio }
				: audio,

			video: typeof video === 'string'
				? { deviceId: video }
				: video
					? { facingMode: 'user' }
					: false
		})

		for (const filter of this.#filters) {
			filter.filter(stream)
		}

		this.#userStream = stream

		return stream
	}

	async getDisplayStream(audio: MediaTrackConstraints, video: MediaTrackConstraints) {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			audio: typeof audio === 'string'
				? { deviceId: audio }
				: audio,

			video: typeof video === 'string'
				? { deviceId: video }
				: video
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
			audio: []
		}

		for (const device of mediaDevices) {
			if (device.kind === 'videoinput') {
				devices.video.push({
					id: device.deviceId,
					label: device.label || `Camera ${devices.video.length + 1}`
				})
			} else {
				devices.audio.push({
					id: device.deviceId,
					label: device.label || `Mic ${devices.audio.length + 1}`
				})
			}
		}

		return devices
	}

	record(stream: MediaStream) {
		var mediaRecorder = this.#mediaRecorder = new MediaRecorder(stream, { mimeType: `video/${videoType}` })
		var recordingChunks: Blob[] = []

		mediaRecorder.start()

		mediaRecorder.onstop = () => {
			var blob = new Blob(recordingChunks, { type: `video/${videoType}` })
			this.#mediaURL = URL.createObjectURL(blob)
		}

		mediaRecorder.ondataavailable = (e: BlobEvent) => {
			if (e.data.size > 0) {
				recordingChunks.push(e.data)
			}
		}
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
		var a = document.createElement('a')
		a.style.display = 'none'
		a.href = this.#mediaURL
		a.download = `${name}.${videoType}`
		document.body.appendChild(a)
		a.click()
		a.remove()
		URL.revokeObjectURL(this.#mediaURL)
	}

	compose(streams: MediaStream[], layout: LayoutConfiguration): MediaStream {
		const videos = streams.map(stream => {
			const video = document.createElement('video')
			video.muted = true
			const mediaStream = new MediaStream([stream.getVideoTracks()[0]])
			video.srcObject = mediaStream
			video.play()
			return video
		})

		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')!

		canvas.width = 1920
		canvas.height = 1080

		canvas.style.width = `${canvas.width / window.devicePixelRatio}`
		canvas.style.height = `${canvas.height / window.devicePixelRatio}`

		function renderFrame() {
			videos.forEach((video, index) => {
				if (video.readyState < video.HAVE_CURRENT_DATA) {
					return
				}

				ctx.save()
				if (index === 0) {
					ctx.drawImage(video, 0, 0)
				} else {
					ctx.translate(canvas.width / 2, canvas.height / 2)
					ctx.scale(.5, .5)

					ctx.beginPath()
					const radius = Math.round(Math.min(video.videoWidth, video.videoHeight) / 2)
					const xOffset = video.videoWidth / 2
					const yOffset = video.videoHeight / 2
					ctx.arc(xOffset, yOffset, radius, 0, 2 * Math.PI)
					ctx.closePath()
					ctx.clip()
					ctx.drawImage(video, 0, 0)
				}
				ctx.restore()
			})
			requestAnimationFrame(renderFrame)
		}

		requestAnimationFrame(renderFrame)

		return canvas.captureStream()
	}
}

export default Celluloid
