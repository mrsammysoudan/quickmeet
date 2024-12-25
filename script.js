// script.js

// Initialize PeerJS with default (public) PeerServer
// If you encounter 'TUNNEL_CONNECTION_FAILED', a firewall or network proxy might be blocking PeerJS.
// You can try specifying a custom config or a different TURN/STUN server.
const peer = new Peer();

// DOM elements
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startButton = document.getElementById("startButton");
const callButton = document.getElementById("callButton");
const myIdDisplay = document.getElementById("my-id");
const friendIdInput = document.getElementById("friend-id");

// OPTIONAL PLACEHOLDERS (if you add them in HTML):
// e.g., <div id="localPlaceholder" class="placeholder"></div>
// e.g., <div id="remotePlaceholder" class="placeholder"></div>
const localPlaceholder = document.getElementById("localPlaceholder");
const remotePlaceholder = document.getElementById("remotePlaceholder");

// Store local camera/mic stream (optional)
let localStream = null;

/**
 * Once the Peer connection is open, show the user's ID
 * and set an initial placeholder if no camera is started.
 */
peer.on("open", (id) => {
  myIdDisplay.textContent = id;

  // Show first letter of Peer ID in local placeholder
  if (localPlaceholder) {
    localPlaceholder.textContent = id.charAt(0).toUpperCase();
    localPlaceholder.style.display = "block";
  }

  // Hide local video initially (until user starts camera)
  if (localVideo) localVideo.style.display = "none";
});

/**
 * Handle incoming calls: if we haven't started our camera,
 * we'll still answer with no media (null) so the call can connect.
 * If you want at least audio, you can getUserMedia({ video: false, audio: true }) in fallback.
 */
peer.on("call", (call) => {
  // Answer the call with local stream if available, or null if camera wasn't started
  call.answer(localStream || null);

  call.on("stream", (remoteStream) => {
    // Check if the remote has an actual video track
    const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
    if (hasVideo) {
      // Show remote video
      if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
        remoteVideo.style.display = "block";
      }
      // Hide remote placeholder if you have one
      if (remotePlaceholder) remotePlaceholder.style.display = "none";
    } else {
      // No video track from remote => show placeholder
      if (remoteVideo) remoteVideo.style.display = "none";
      if (remotePlaceholder) {
        // Optionally display the remote's first initial if desired:
        // remotePlaceholder.textContent = call.peer.charAt(0).toUpperCase();
        remotePlaceholder.style.display = "block";
      }
    }
  });

  call.on("close", () => {
    if (remoteVideo) remoteVideo.srcObject = null;
    alert("The call has ended.");
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    alert("An error occurred during the call.");
  });
});

/**
 * Let the user optionally start their camera (and mic).
 * If they never press this button, localStream remains null
 * and calls will be voice/data-only or no-media.
 */
startButton.onclick = async () => {
  try {
    // Request video+audio. Adjust as needed if you only want audio:
    // navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    // Show local video
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.style.display = "block";
    }

    // Hide placeholder once we have a real video feed
    if (localPlaceholder) localPlaceholder.style.display = "none";

    startButton.disabled = true;
  } catch (err) {
    console.error("Failed to access camera/microphone:", err);
    alert(
      "Unable to access camera/microphone. Check permissions or try again."
    );
  }
};

/**
 * Initiate a call to a friend. If we haven't started our camera,
 * the remote user will see us as audio-only or no-media, depending on their own setup.
 */
callButton.onclick = () => {
  const friendId = friendIdInput.value.trim();
  if (!friendId) {
    alert("Please enter your friend's ID.");
    return;
  }

  // Attempt to create the call, passing in our localStream (or null if none).
  const call = peer.call(friendId, localStream || null);
  if (!call) {
    alert(
      "Failed to start a call. Check your friend's ID or network connection."
    );
    return;
  }

  call.on("stream", (remoteStream) => {
    // Check if the remote has a video track
    const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
    if (hasVideo) {
      if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
        remoteVideo.style.display = "block";
      }
      if (remotePlaceholder) remotePlaceholder.style.display = "none";
    } else {
      // Show placeholder if no remote video
      if (remoteVideo) remoteVideo.style.display = "none";
      if (remotePlaceholder) {
        // remotePlaceholder.textContent = call.peer.charAt(0).toUpperCase();
        remotePlaceholder.style.display = "block";
      }
    }
  });

  call.on("close", () => {
    if (remoteVideo) remoteVideo.srcObject = null;
    alert("The call has ended.");
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    alert("An error occurred during the call.");
  });
};
