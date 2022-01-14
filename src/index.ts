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

	compose(streams: MediaStream[]): MediaStream {
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
		const output = canvas.captureStream()

		function renderFrame() {
			videos.map(video => {
				if (video.readyState < video.HAVE_CURRENT_DATA) {
					return
				}

				if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
					canvas.width = video.videoWidth
					canvas.height = video.videoHeight
				}

				ctx.drawImage(video, 0, 0)
			})
			requestAnimationFrame(renderFrame)
		}

		renderFrame()

		return output
	}
}

export default Celluloid
