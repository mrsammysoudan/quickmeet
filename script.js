// script.js

/**********************************************
 *   QuickMeet Multi-Party with Optional Camera,
 *   Mute Button, and Invite More Participants
 **********************************************/

// Initialize a PeerJS instance with the public PeerServer
// If you hit issues with "TUNNEL_CONNECTION_FAILED", a firewall or proxy
// may be blocking the connection. You could specify a custom TURN/STUN server if needed.
const peer = new Peer();

// DOM References
const localVideoPoster = document.getElementById("localVideoPoster");
const localVideo = document.getElementById("localVideo");
const muteButton = document.getElementById("muteButton");
const startButton = document.getElementById("startButton");
const inviteButton = document.getElementById("inviteButton");
const callButton = document.getElementById("callButton");

const myIdDisplay = document.getElementById("my-id");
const friendIdInput = document.getElementById("friend-id");
const participantsContainer = document.getElementById("participants");

// We'll store localStream (if the user starts camera)
let localStream = null;

// Keep track of active calls for multi-party
let activeCalls = [];

/**
 * PeerJS "open" event: the connection to the PeerServer is established,
 * we get our unique peer ID, which we display to the user.
 */
peer.on("open", (id) => {
  myIdDisplay.textContent = id;

  // Show placeholder letter in local video area if no camera is used
  // In this example, we show the first letter of the ID
  localVideoPoster.textContent = id.charAt(0).toUpperCase();
  localVideoPoster.style.display = "flex"; // show placeholder
});

/**
 * Handle incoming calls: for multi-party,
 * each call is separate. We answer with localStream (or null).
 */
peer.on("call", (incomingCall) => {
  // If we haven't started camera, it's okay—answer with null
  incomingCall.answer(localStream || null);
  handleNewCall(incomingCall);
});

/**
 * Start Camera Button
 * Requests video + audio from user (front-facing on mobile).
 * If they deny or it fails, we keep localStream = null.
 */
startButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true,
    });

    // Hide local poster, show local video
    localVideoPoster.style.display = "none";
    localVideo.srcObject = localStream;
    localVideo.style.display = "block";

    startButton.disabled = true;
  } catch (err) {
    console.error("Failed to access camera/mic:", err);
    alert(
      "Unable to access camera/mic. You can still join calls without video."
    );
  }
};

/**
 * Mute Button
 * Toggles the first audio track in localStream if it exists.
 */
muteButton.onclick = () => {
  if (!localStream) {
    alert("You haven't enabled your microphone/camera yet!");
    return;
  }

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  audioTrack.enabled = !audioTrack.enabled;
  muteButton.textContent = audioTrack.enabled ? "Mute" : "Unmute";
};

/**
 * Invite More People
 * Prompts for a friend's ID, then calls them.
 * Each new call is added to activeCalls.
 */
inviteButton.onclick = () => {
  const newFriendId = prompt("Enter a new friend's ID to invite:");
  if (!newFriendId) return;

  const newCall = peer.call(newFriendId, localStream || null);
  if (!newCall) {
    alert("Failed to call the new friend. Check their ID or your connection.");
    return;
  }
  handleNewCall(newCall);
};

/**
 * Call Friend Button
 * Creates a call with the friend ID in the input. (Similar to Invite.)
 */
callButton.onclick = () => {
  const friendId = friendIdInput.value.trim();
  if (!friendId) {
    alert("Please enter your friend's ID.");
    return;
  }

  const call = peer.call(friendId, localStream || null);
  if (!call) {
    alert("Failed to start a call. Check the ID or your connection.");
    return;
  }
  handleNewCall(call);
};

/**
 * Helper: handleNewCall(call)
 *  - Add call to activeCalls array
 *  - Listen for "stream" event to create a new <video> or placeholder
 *    for each participant
 */
function handleNewCall(call) {
  activeCalls.push(call);

  call.on("stream", (remoteStream) => {
    // Create a new <div> to hold the remote user’s media
    const participantDiv = document.createElement("div");
    participantDiv.classList.add("participant");

    // Create a new video element
    const participantVideo = document.createElement("video");
    participantVideo.autoplay = true;
    participantVideo.playsInline = true;
    participantVideo.style.width = "200px";
    participantVideo.style.margin = "5px";
    participantVideo.controls = false; // we can hide native controls

    const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
    if (hasVideo) {
      participantVideo.srcObject = remoteStream;
    } else {
      // If no video track, you can show a placeholder letter
      // (like the local poster logic).
      const placeholder = document.createElement("div");
      placeholder.classList.add("poster");
      placeholder.style.width = "200px";
      placeholder.style.height = "150px";
      placeholder.style.lineHeight = "150px";
      placeholder.textContent = call.peer.charAt(0).toUpperCase();
      participantDiv.appendChild(placeholder);
    }

    participantDiv.appendChild(participantVideo);
    participantsContainer.appendChild(participantDiv);
  });

  call.on("close", () => {
    activeCalls = activeCalls.filter((c) => c !== call);
    alert(`Call with ${call.peer} ended.`);

    // Remove that participant’s video/placeholder from DOM
    const vids = participantsContainer.getElementsByTagName("video");
    for (let i = vids.length - 1; i >= 0; i--) {
      // find the video whose "srcObject" belongs to this call
      if (vids[i].srcObject === call.remoteStream) {
        vids[i].parentElement.remove();
      }
    }
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    alert(`Error with call peer: ${call.peer}`);
  });
}
