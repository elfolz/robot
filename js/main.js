import * as THREE from './three.module.js'
import { GLTFLoader } from './gltfLoader.module.js'
import { FBXLoader } from './fbxLoader.module.js'
import { OrbitControls } from './orbitControls.js'

if (location.protocol.startsWith('https')) {
	navigator.serviceWorker.register('service-worker.js')
	navigator.serviceWorker.onmessage = m => {
		console.info('Update found!')
		if (m?.data == 'update') location.reload(true)
	}
}

const synth = new SpeechSynthesisUtterance()
const clock = new THREE.Clock()
const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true})
const camera = new THREE.PerspectiveCamera(75, window.innerWidth /window.innerHeight, 0.1, 1000)
const hemisphereLight = new THREE.HemisphereLight(0xddeeff, 0x000000, 0.25)
const dirLight1 = new THREE.DirectionalLight(0xFFFFFF, 1)
const dirLight2 = new THREE.DirectionalLight(0xFFFFFF, 1)
const dirLight3 = new THREE.DirectionalLight(0xFFFFFF, 1)
const gltfLoader = new GLTFLoader()
const fbxLoader = new FBXLoader()
const scene = new THREE.Scene()
const controls = new OrbitControls(camera, renderer.domElement)
const fpsLimit = 1 / 60
const reader = new FileReader()
const animationModels = ['acknowledging', 'agreeing', 'clapping', 'defeat', 'disappointed', 'dismissing', 'fistPump', 'formalBow', 'happyIdle', 'happyWalk', 'headGesture', 'hipHopDance', 'idle', 'pouting', 'surprised', 'talking', 'thoughtful', 'walking', 'waving']

const progress = new Proxy({}, {
	set: function(target, key, value) {
		target[key] = value
		let values = Object.values(target).slice()
		let progressbar = document.querySelector('progress')
		let total = values.reduce((a, b) => a + b, 0)
		total = total / (animationModels.length + 1)
		if (progressbar) progressbar.value = parseInt(total || 0)
		if (total >= 100) setTimeout(() => initGame(), 1000)
		return true
	}
})

scene.background = null
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.sortObjects = false
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.setClearColor(0x000000, 0)
scene.add(hemisphereLight)
controls.screenSpacePanning = true
controls.enableZoom = false
dirLight1.position.set(0, 0, 0)
dirLight2.position.set(100, -50, 0)
dirLight3.position.set(-100, -50, 0)
scene.add(dirLight1)
scene.add(dirLight2)
scene.add(dirLight3)

var clockDelta = 0
var gameStarted = false
var hasGreeting = false
var robot
var mixer
var photo
var animations = []
var lastAction
var loading
var audioContext
var destination
var voiceGain
var robotGain
var voiceSrc
var robotSrc
var robotBuffer

reader.onload = e => {
	photo.src = e.target.result
}

function loadModel() {
	gltfLoader.load('./models/robot.glb',
		gltf => {
			robot = gltf.scene
			robot.colorSpace = THREE.SRGBColorSpace
			robot.position.y = -1
			mixer = new THREE.AnimationMixer(robot)
			dirLight1.target = robot
			dirLight2.target = robot
			dirLight3.target = robot
			scene.add(robot)
			loadAnimations()
		}, xhr => {
			progress['robot'] = (xhr.loaded / (xhr.total || 1)) * 100
		}, error => {
			console.error(error)
		}
	)
}

function loadAnimations() {
	animationModels.forEach(el => {
		fbxLoader.load(`./models/${el}.fbx`, fbx => {
			animations[el] = mixer.clipAction(fbx.animations[0])
			animations[el].name = el
			if (el == 'idle') {
				lastAction = animations[el]
				animations[el].play()
			}
		}, xhr => {
			progress[el] = (xhr.loaded / (xhr.total || 1)) * 100
		}, error => {
			console.error(error)
		})
	})
}

function initGame() {
	if (gameStarted) return
	gameStarted = true
	document.body.classList.add('loaded')
	document.body.removeChild(document.querySelector('figure'))
	document.querySelector('footer').style.removeProperty('display')
	resizeScene()
	animate()
}

function resizeScene() {
	camera.aspect = window.visualViewport.width / window.visualViewport.height
	camera.updateProjectionMatrix()
	renderer.setPixelRatio(window.devicePixelRatio)
	renderer.setSize(window.visualViewport.width, window.visualViewport.height)
	camera.position.z = 2
}

function animate() {
	requestAnimationFrame(animate)
	if (document.hidden) return
	clockDelta += clock.getDelta()
	if (fpsLimit && clockDelta < fpsLimit) return
	mixer?.update(clockDelta)
	renderer.render(scene, camera)
	controls.update()
	clockDelta = fpsLimit ? clockDelta % fpsLimit : clockDelta
}

function executeCrossFade(newAction, loop='repeat') {
	if (lastAction == newAction) return newAction.reset()
	newAction.enabled = true
	newAction.setEffectiveTimeScale(1)
	newAction.setEffectiveWeight(1)
	newAction.loop = loop == 'pingpong' ? THREE.LoopPingPong : loop == 'once' ? THREE.LoopOnce : THREE.LoopRepeat
	newAction.clampWhenFinished = loop == 'once'
	if (loop == 'once') newAction.reset()
	lastAction.crossFadeTo(newAction, 0.25, true)
	lastAction = newAction
	newAction.play()
}

function synchronizeCrossFade(newAction, loop='repeat') {
	mixer.addEventListener('finished', onLoopFinished)
	function onLoopFinished() {
		mixer.removeEventListener('finished', onLoopFinished)
		executeCrossFade(newAction, loop)
	}
}

function speak(text) {
	if (!text) return
	if (/edg/i.test(navigator.userAgent)) return localVoice(text)
	naturalVoice(text)
}

function naturalVoice(text) {
	fetch(`https://us-central1-stop-dbb76.cloudfunctions.net/api/naturalvoice`, {
		method: 'POST',
		headers: {'content-type': 'application/ssml+xml'},
		body: text.trim()
	})
	.then(response => {
		return response.blob()
	})
	.then(response => {
		if (document.hidden) return
		playAudio()
		if (voiceSrc) voiceSrc.disconnect()
		voiceSrc = audioContext.createBufferSource()
		voiceSrc.buffer = response
		voiceSrc.connect(voiceGain)
		voiceSrc.start(0)
		voiceSrc.onended = () => {
			voiceSrc.disconnect()
			robotSrc?.disconnect()
			robotSrc = undefined
		}
	})
	.catch(error => {
		localVoice(text)
	})
}

function localVoice(text) {
	if (!synth.voice) {
		var voice
		['antonio', 'daniel', 'reed', 'brasil'].some(el => {
			voice = speechSynthesis.getVoices().find(_ => _.name.toLocaleLowerCase().includes(el.toLocaleLowerCase()) && _.lang.substring(0, 2).toLocaleLowerCase() == 'pt')
			if (voice) return true
		})
		if (!voice) return setTimeout(() => speak(text), 100)
		synth.voice = voice
	}
	speechSynthesis.cancel()
	synth.lang = synth.voice?.lang ?? 'pt-BR'
	synth.text = text.trim()
	if (synth.voice?.name.toLocaleLowerCase().includes('daniel')) {
		synth.pitch = 1.5
		synth.rate = 1.5
	}
	speechSynthesis.speak(synth)
}

function talk(text) {
	if (!text || loading) return
	loading = true
	playAudio()
	executeCrossFade(animations['thoughtful'], 'once')
	fetch('https://us-central1-stop-dbb76.cloudfunctions.net/api/chatgpt', {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: JSON.stringify({text: text.trim()})
	})
	.then(response => {
		return response.json()
	})
	.then(json => {
		speak(json.choices[0].message.content)
	})
	.catch(e => {
		speechSynthesis.stop()
		voiceSrc?.disconnect()
		robotSrc?.disconnect()

	})
	.finally(() => {
		document.querySelector('input').disabled = false
		document.querySelector('input').value = null
		document.querySelector('input').focus()
		loading = false
	})
}

function animateTalk() {
	const talkAnimations = ['agreeing', 'talking', 'acknowledging', 'dismissing', 'headGesture', 'pouting']
	const talkAnimation = animations[talkAnimations[Math.floor(Math.random() * talkAnimations.length)]]
	if (lastAction?.name == 'idle') executeCrossFade(talkAnimation, 'once')
	else synchronizeCrossFade(talkAnimation, 'once')
}

function initAudio() {
	audioContext = new AudioContext()
	voiceGain = audioContext.createGain()
	robotGain = audioContext.createGain()
	robotGain.gain.value = 0.25
	destination = audioContext.createMediaStreamDestination()
	voiceGain.connect(audioContext.destination)
	robotGain.connect(audioContext.destination)
	document.querySelector('audio').srcObject = destination.stream
	document.querySelector('audio').play()
	fetch(`./audio/robot.mp3`)
	.then(response => {
		return response.blob()
	})
	.then(response => {
		response.arrayBuffer()
		.then(buffer => {
			audioContext.decodeAudioData(buffer)
			.then(response => {
				robotBuffer = response
			})
		})
	})
}

function playAudio() {
	if (!audioContext || !robotBuffer) return
	if (robotSrc) robotSrc.disconnect()
	robotSrc = audioContext.createBufferSource()
	robotSrc.buffer = robotBuffer
	robotSrc.loop = true
	robotSrc.connect(robotGain)
	robotSrc.start(0)
	robotSrc.onended = () => {
		robotSrc?.disconnect()
		robotSrc = undefined
	}
}

synth.onboundary = () => {
	animateTalk()
}
synth.onstart = () => {
	playAudio()
	animateTalk()
}
synth.onresume = () => {
	playAudio()
	animateTalk()
}
synth.onend = () => {
	executeCrossFade(animations['idle'])
	document.querySelector('audio').pause()
}
synth.onpause = () => {
	executeCrossFade(animations['idle'])
	document.querySelector('audio').pause()
}
synth.onerror = () => {
	speechSynthesis.cancel()
	executeCrossFade(animations['idle'])
	document.querySelector('audio').pause()
}

window.onresize = () => resizeScene()
window.visualViewport.onresize = () => resizeScene()
window.visualViewport.onscroll = () => resizeScene()

document.onreadystatechange = () => {
	if (document.readyState != 'complete') return
	loadModel()
	document.querySelector('#speak').onclick = () => {
		if (loading) return
		talk(document.querySelector('input').value)
		document.querySelector('input').disabled = true
	}
	document.querySelector('input').onkeydown = e => {
		if (e.keyCode != 13 || loading) return
		talk(document.querySelector('input').value)
		document.querySelector('input').disabled = true
	}
}
document.onvisibilitychange = () => {
	if (!document.hidden) return
	voiceSrc?.disconnect()
	robotSrc?.disconnect()
	speechSynthesis.cancel()
	document.querySelector('input').value = null
	document.querySelector('input').disabled = false
}
document.onclick = () => {
	if (!gameStarted || hasGreeting) return
	initAudio()
	playAudio()
	speak('Olá humano! Para falar comigo, digite no campo de texto abaixo.')
	hasGreeting = true
}
document.body.appendChild(renderer.domElement)