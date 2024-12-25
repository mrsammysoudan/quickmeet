// script.js

// Initialize PeerJS with default PeerServer
const peer = new Peer();

// Get DOM elements
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startButton = document.getElementById("startButton");
const callButton = document.getElementById("callButton");
const myIdDisplay = document.getElementById("my-id");
const friendIdInput = document.getElementById("friend-id");

let localStream;

// Display your Peer ID once the connection is open
peer.on("open", (id) => {
  myIdDisplay.textContent = id;
});

// Handle incoming calls
peer.on("call", (call) => {
  if (!localStream) {
    alert("Please start your camera before receiving calls.");
    return;
  }

  call.answer(localStream); // Answer the call with your stream

  call.on("stream", (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
  });

  call.on("close", () => {
    remoteVideo.srcObject = null;
    alert("The call has ended.");
  });

  call.on("error", (err) => {
    console.error(err);
    alert("An error occurred during the call.");
  });
});

// Start your camera and display the stream
startButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
    startButton.disabled = true;
  } catch (err) {
    console.error("Failed to access camera and microphone", err);
    alert("Unable to access camera and microphone. Please check permissions.");
  }
};

// Initiate a call to a friend
callButton.onclick = () => {
  const friendId = friendIdInput.value.trim();

  if (!friendId) {
    alert("Please enter your friend's ID.");
    return;
  }

  if (!localStream) {
    alert("Please start your camera before making a call.");
    return;
  }

  const call = peer.call(friendId, localStream);

  call.on("stream", (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
  });

  call.on("close", () => {
    remoteVideo.srcObject = null;
    alert("The call has ended.");
  });

  call.on("error", (err) => {
    console.error(err);
    alert("An error occurred during the call.");
  });
};
