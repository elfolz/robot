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
const animationModels = ['acknowledging', 'agreeing', 'clapping', 'defeat', 'disappointed', 'dismissing', 'fistPump', 'formalBow', 'happyWalk', 'hipHopDance', 'idle', 'surprised', 'talking', 'thoughtful', 'walking', 'waving']

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
var robot
var mixer
var photo
var animations = []
var lastAction

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
	speak('Olá humano! Para falar comigo, digite no campo de texto abaixo.')
	resizeScene()
	animate()
}

function resizeScene() {
	camera.aspect = window.innerWidth / window.innerHeight
	camera.updateProjectionMatrix()
	renderer.setPixelRatio(window.devicePixelRatio)
	renderer.setSize(window.innerWidth, window.innerHeight)
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

function executeCrossFade(newAction) {
	if (lastAction == newAction) return
	newAction.enabled = true
	newAction.setEffectiveTimeScale(1)
	newAction.setEffectiveWeight(1)
	newAction.loop = 'repeat'
	lastAction.crossFadeTo(newAction, 0.25, true)
	lastAction = newAction
	newAction.play()
}

function speak(text) {
	if (!text) return
	if (!synth.voice) {
		const actors = ['Daniel']
		const voice = speechSynthesis.getVoices().find(el => {
			return new RegExp(`(${actors.join('|')})`, 'i').test(el.name)
		})
		if (!voice) return setTimeout(() => speak(text), 100)
		synth.voice = voice
	}
	speechSynthesis.cancel()
	synth.lang = synth.voice?.lang ?? 'pt-BR'
	synth.text = text
	synth.pitch = 1.5
	synth.rate = 1.5
	speechSynthesis.speak(synth)
}

window.onresize = () => resizeScene()

document.onreadystatechange = () => {
	if (document.readyState != 'complete') return
	loadModel()
	document.querySelector('#next-animation').onclick = () => {
		const i = animationModels.findIndex(el => el == lastAction.name)
		const index = i < (animationModels.length-1) ? i+1 : 0
		executeCrossFade(animations[animationModels[index]])
	}
	document.querySelector('#speak').onclick = () => {
		speak(document.querySelector('input').value?.trim())
	}
	document.querySelector('input').onkeydown = e => {
		if (e.keyCode == 13) speak(document.querySelector('input').value?.trim())
	}
}
document.onvisibilitychange = () => {
	if (document.hidden) speechSynthesis.cancel()
}
document.body.appendChild(renderer.domElement)