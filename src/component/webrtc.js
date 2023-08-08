
import {io} from 'socket.io-client';
// const mediasoupClient = require('mediasoup-client')
import {Device} from 'mediasoup-client';
import { useEffect, useRef, useState } from 'react';
import './WebRtcVideo.scss';

const roomName = window.location.pathname.split('/')[2] || 'room12';

let socket;

let device, rtpCapabilities, producerTransport, consumerTransports = [],consumerTransport, 
audioProducer, videoProducer, consumer, isProducer = false, producerObject, screenShareProducer, isScreenShare = false;
// let localVideo;
// let videoContainer;

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
let params = {
  // mediasoup params
  encodings: [
    {
      rid: 'r0',
      maxBitrate: 100000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r1',
      maxBitrate: 300000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r2',
      maxBitrate: 900000,
      scalabilityMode: 'S1T3',
    },
  ],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000
  }
}

let audioParams;
let screenParams;
let videoParams = { params };
let consumingTransports = [];
socket = io("http://localhost:3001/mediasoup")

const WebRtcVideo = () => {

    console.log("VP", videoProducer)
    const localVideo = useRef();
    const localScreenVideo = useRef();
    const videoContainer = useRef([])
    const [getRemoteVideo, setRemoteVideo] = useState([]);
    const [currentVideo, setCurrentVideo] = useState()
    const [muteAudio, setMuteAudio] = useState(false);
    const [muteVideo, setMuteVideo] = useState(false);
    const [joinCall, setJoinCall] = useState(false);
    const [updateReRender, setUpdateReRender] = useState(false);
    const videoContainers = useRef()
    const [userName, setUserName] = useState('');
    const [enableScreenShare, setEnableScreenShare] = useState(false);

    useEffect(() => {
        videoContainers.current = document.getElementById('videoContainer')
    },[])

    const streamSuccess = (stream) => {
        setUpdateReRender(prev => !prev)
        localVideo.current.srcObject = stream;
        if (stream) {
            setJoinCall(true);
        }
        audioParams = { track: stream.getAudioTracks()[0], ...audioParams };

        videoParams = { track: stream.getVideoTracks()[0], ...videoParams };

        joinRoom()
    }

    const streamSuccessShare = (stream) => {

        localScreenVideo.current.srcObject = stream;
        
        audioParams = { track: stream.getAudioTracks()[0], ...audioParams };

        screenParams = { track: stream.getVideoTracks()[0], ...screenParams };

        connectSendTransport()
    }


    const joinRoom = () => {
        socket.emit('joinRoom', { roomName }, (data) => {
            console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
            // we assign to local variable and will be used when
            // loading the client Device (see createDevice above)
            console.log(data.rtpCapabilities , 'joinroomcpaapap');
            rtpCapabilities = data.rtpCapabilities

            // once we have rtpCapabilities from the Router, create Device
            console.log('sdsdsfsd')
            createDevice()
        })
    }

    const getLocalStream = () => {
        navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
            width: {
                min: 640,
                max: 1920,
            },
            height: {
                min: 400,
                max: 1080,
            }
            }
        })
        .then(streamSuccess)
        .catch(error => {
            console.log(error.message)
        })
    }

    const getLocalShareStream = () => {

        isScreenShare = true;
        console.log(enableScreenShare)
        setEnableScreenShare(true)
        navigator.mediaDevices.getDisplayMedia({
           
            audio: true,
            video: {
                width: { ideal: 1920, max: 1920 },
                height: { ideal: 1080, max: 1080 }
              }
        })
        .then(streamSuccessShare)
        .catch(error => {
            console.log(error.message)
        })
    }

    // A device is an endpoint connecting to a Router on the
    // server side to send/recive media
    const createDevice = async () => {
        try {
            // device = new mediasoupClient.Device()
            device = new Device()

            // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
            // Loads the device with RTP capabilities of the Router (server side)
            console.log(rtpCapabilities, 'createdevice');
            await device.load({
            // see getRtpCapabilities() below
            routerRtpCapabilities: rtpCapabilities
            })

            console.log('Device RTP Capabilities', device.rtpCapabilities)

            // once the device loads, create transport
            createSendTransport()

        } catch (error) {
            console.log(error)
            if (error.name === 'UnsupportedError')
            console.warn('browser not supported')
        }
    }

    const createSendTransport = () => {
        // see server's socket.on('createWebRtcTransport', sender?, ...)
        // this is a call from Producer, so sender = true
        socket.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
            // The server sends back params needed 
            // to create Send Transport on the client side
            if (params.error) {
            console.log(params.error)
            return
            }

            console.log(params)
            // creates a new WebRTC Transport to send media
            // based on the server's producer transport params
            // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
            producerTransport = device.createSendTransport(params)
            // producerObject = new Producer(producerTransport)

            // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
            // this event is raised when a first call to transport.produce() is made
            // see connectSendTransport() below
            producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                // Signal local DTLS parameters to the server side transport
                console.log('transport-connect');
                // see server's socket.on('transport-connect', ...)
                await socket.emit('transport-connect', {
                dtlsParameters,
                })

                // Tell the transport that parameters were transmitted.
                callback()

            } catch (error) {
                errback(error)
            }
            })

            producerTransport.on('produce', async (parameters, callback, errback) => {
            console.log(parameters)

            try {
                // tell the server to create a Producer
                // with the following parameters and produce
                // and expect back a server side producer id
                // see server's socket.on('transport-produce', ...)
                await socket.emit('transport-produce', {
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
                appData: parameters.appData,
                }, ({ id, producersExist }) => {
                // Tell the transport that parameters were transmitted and provide it with the
                // server side producer's id.
                callback({ id })

                // if producers exist, then join room
                if (producersExist) getProducers()
                })
            } catch (error) {
                errback(error)
            }
            })

            connectSendTransport()
        })
    }

    const connectSendTransport = async () => {
        // we now call produce() to instruct the producer transport
        // to send media to the Router
        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
        // this action will trigger the 'connect' and 'produce' events above
        // debugger
        audioProducer = await producerTransport.produce(audioParams);
        if (!isScreenShare) {
            videoProducer = await producerTransport.produce(videoParams);
            videoProducer.on('trackended', () => {
                console.log('video track ended')
    
                // close video track
            })
    
            videoProducer.on('transportclose', () => {
                console.log('video transport ended')
    
                // close video track
            })
        }
        if (isScreenShare) {
            screenShareProducer = await producerTransport.produce(screenParams)
            screenShareProducer.on('trackended', () => {
                console.log('video track ended')
    
                // close video track
            })
    
            screenShareProducer.on('transportclose', () => {
                console.log('video transport ended')
    
                // close video track
            })
        }

        audioProducer.on('trackended', () => {
            console.log('audio track ended')

            // close audio track
        })

        audioProducer.on('transportclose', () => {
            console.log('audio transport ended')

            // close audio track
        })
        
       
       
    }

    const signalNewConsumerTransport = async (remoteProducerId) => {
        //check if we are already consuming the remoteProducerId
        if (consumingTransports.includes(remoteProducerId)) return;
        consumingTransports.push(remoteProducerId);

        await socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
            // The server sends back params needed 
            // to create Send Transport on the client side
            if (params.error) {
            console.log(params.error)
            return
            }
            console.log(`PARAMS... ${params}`)

            // let consumerTransport
            try {
            consumerTransport = device.createRecvTransport(params)
            } catch (error) {
            // exceptions: 
            // {InvalidStateError} if not loaded
            // {TypeError} if wrong arguments.
            console.log(error)
            return
            }

            consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                // Signal local DTLS parameters to the server side transport
                // see server's socket.on('transport-recv-connect', ...)
                await socket.emit('transport-recv-connect', {
                dtlsParameters,
                serverConsumerTransportId: params.id,
                })

                // Tell the transport that parameters were transmitted.
                callback()
            } catch (error) {
                // Tell the transport that something was wrong
                errback(error)
            }
            })

            connectRecvTransport(consumerTransport, remoteProducerId, params.id)
        })
    }

    

    const getProducers = () => {
        socket.emit('getProducers', producerIds => {
            console.log(producerIds)
            // for each of the producer create a consumer
            // producerIds.forEach(id => signalNewConsumerTransport(id))
            producerIds.forEach(signalNewConsumerTransport)
        })
    }

    const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
        // for consumer, we need to tell the server first
        // to create a consumer based on the rtpCapabilities and consume
        // if the router can consume, it will send back a set of params as below

        await socket.emit('consume', {
            rtpCapabilities: device.rtpCapabilities,
            remoteProducerId,
            serverConsumerTransportId,
        }, async ({ params }) => {
            // debugger
            if (params.error) {
            console.log('Cannot Consume')
            return
            }

            console.log(`Consumer Params ${params}`)
            // then consume with the local consumer transport
            // which creates a consumer
            const consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
            })

            consumerTransports = [
            ...consumerTransports,
            {
                consumerTransport,
                serverConsumerTransportId: params.id,
                producerId: remoteProducerId,
                consumer,
            },
            ]

            
            // create a new div element for the new consumer media
            const newElem = document.createElement('div')
            newElem.setAttribute('id', `td-${remoteProducerId}`)

            if (params.kind === 'audio') {
            //append to the audio container
            newElem.innerHTML = '<audio id="' + remoteProducerId + '" autoplay></audio>'
            } else {
            //append to the video container
            newElem.setAttribute('class', 'remoteVideo')
            newElem.innerHTML = '<video id="' + remoteProducerId + '" autoplay class="video" ></video>'
            }

            videoContainers.current.appendChild(newElem)

            // destructure and retrieve the video track from the producer
    
            const { track } = consumer;

            let stream1 = new MediaStream([track])
            setCurrentVideo(track.id)
            setRemoteVideo((vid) => [...vid, {id: track.id, stream: stream1}])

            console.log(getRemoteVideo, 'getremotevideo')
            // videoContainer.current.srcObject = stream1;

            document.getElementById(remoteProducerId).srcObject = new MediaStream([track])
            

            // the server consumer started with media paused
            // so we need to inform the server to resume
            socket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
        })
    }

    const makeCall = () => {
        videoContainers.current = document.getElementById('videoContainer')
        socket = io("http://localhost:5000/mediasoup")
        // if (producerTransport) {
        //     producerTransport.close();
        // }
        // console.log(producerTransport, 'producertrans', consumerTransports, 'consumetrans')
        socket.on('connection-success', ({ socketId }) => {
            console.log(socketId)
            getLocalStream()
          })


        // server informs the client of a new producer just joined
        socket.on('new-producer', ({ producerId }) => signalNewConsumerTransport(producerId))

        socket.on('producer-closed', ({ remoteProducerId }) => {
            // server notification is received when a producer is closed
            // we need to close the client-side consumer and associated transport
            const producerToClose = consumerTransports.find(transportData => transportData.producerId === remoteProducerId)
            producerToClose.consumerTransport.close()
            producerToClose.consumer.close()
        
            // remove the consumer transport from the list
            consumerTransports = consumerTransports.filter(transportData => transportData.producerId !== remoteProducerId)
        
            // remove the video div element
            const targetElement = document.getElementById(`td-${remoteProducerId}`);

            const isContained = videoContainers.current.contains(targetElement);
            if (isContained) videoContainers.current.removeChild(document.getElementById(`td-${remoteProducerId}`))
        })
    }

    const closeConnection = () => {
        setJoinCall(false)
        setUserName('')
        if (socket.connected) socket.close();
        socket = null;
        localVideo.current.srcObject = null;
        localScreenVideo.current.srcObject = null;
       
        if (videoProducer && !videoProducer.closed) { 

            videoProducer.close();
            videoProducer = null;
        }

        if (screenShareProducer && !screenShareProducer.closed) {
            screenShareProducer.close();
            screenShareProducer = null;
        }

        if (audioProducer && !audioProducer.closed) {
            audioProducer.close();
            audioProducer = null;
        }
        if (consumerTransport && !consumerTransport.closed) {
            consumerTransport.close();
            consumerTransport = null;
            consumingTransports = []
        }
        if (producerTransport && !producerTransport.closed) {
            producerTransport.close();
            producerTransport = null;
        }
        isScreenShare = false;
        audioParams = undefined;
        videoParams = { params };
        device = null;
        screenParams = undefined;
        setEnableScreenShare(false);
        if  (videoContainers.current) {
            let children = videoContainers.current.children;
            for (let i = 0; i < children.length; i++) {
                if (i > 0) {
                    videoContainers.current.removeChild(children[i]);
                    i = i - 1;
                }
            }
        }
    }
  

    return (

        <div className="iassist-video-main-conatiner">
            <div className='iassist-button-container'>
            {!joinCall &&<> <label style={{color:'aliceblue'}}>UserName : </label> <input onChange={(e) => setUserName(e.target.value)}></input></>}
                {!joinCall && userName &&<button className='iassist-button' onClick={() => makeCall()}>Join Call</button>}
                {joinCall && <button className='iassist-button' onClick={() => {
                    !muteVideo ? videoProducer.pause() : videoProducer.resume();
                    setMuteVideo(prev => !prev)
                    
                }}>{ muteVideo ? 'Unmute' : 'Mute'} Video</button>}
               {joinCall && <button className='iassist-button' onClick={() =>{
                    // const {_producers } = producerTransport;
                    // const firstValue = Array.from(_producers.values())[0];
                    muteAudio ? audioProducer.resume(): audioProducer.pause(); //firstValue._track.enabled = true : firstValue._track.enabled = false;
                    setMuteAudio(prev => !prev);
                }}>{ muteAudio ? 'Unmute' : 'Mute'} Audio</button>}
                {joinCall && <button className='iassist-button' onClick={() => {getLocalShareStream()}}>Screen Share</button>}
                {joinCall && <button className='iassist-button' onClick={() => closeConnection()}>Exit</button>}
            </div>

            <div className='iassist-mediasoup-container'>
                <div id="videoContainer">
                    <video id="localVideo" className={joinCall ? "local-screen-visible" : "local-screen-none"} ref={localVideo} autoPlay muted ></video>
                    {/* <span>
                        {userName}
                    </span> */}
                    {console.log(enableScreenShare, 'enavkead')}
                    <video id="localVideo1" className={isScreenShare ? "local-screen-visible" : "local-screen-none"} ref={localScreenVideo} autoPlay muted ></video>
                </div>
            </div>
        </div>
    )
}

export default WebRtcVideo;