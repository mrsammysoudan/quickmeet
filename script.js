// script.js

/**********************************************
 *   QuickMeet Multi-Party
 *   - Optional Camera on Both Mobile & PC
 *   - Mute Button
 *   - Invite More Participants
 **********************************************/

// Initialize a PeerJS instance with the public PeerServer
// If you see "TUNNEL_CONNECTION_FAILED", your network might block the default server.
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

// We'll store localStream if the user starts camera.
// If they never do, it remains null, meaning no audio/video from this user.
let localStream = null;

// Keep track of active calls for multi-party
let activeCalls = [];

/**
 * PeerJS "open" event: connection to PeerServer is established,
 * we get our unique peer ID, displayed to the user.
 */
peer.on("open", (id) => {
  myIdDisplay.textContent = id;

  // Show placeholder letter in local video area, in case we never enable camera
  localVideoPoster.textContent = id.charAt(0).toUpperCase();
  localVideoPoster.style.display = "flex"; // show big letter
});

/**
 * Handle incoming calls: for multi-party,
 * each call is separate. We answer with localStream (or null).
 */
peer.on("call", (incomingCall) => {
  // If we haven't started camera/mic, that's fine—answer with null
  incomingCall.answer(localStream || null);
  handleNewCall(incomingCall);
});

/**
 * START CAMERA button
 * - Tries to request camera + mic
 * - If the user denies, localStream = null, so we remain no-media
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
    console.warn("User denied or no camera/mic:", err);
    alert(
      "You can still proceed without camera/mic. Calls will be no-media from your side."
    );
    // localStream stays null -> purely text/placeholder for them
  }
};

/**
 * MUTE BUTTON
 * - Toggles the local audio track if we have one
 */
muteButton.onclick = () => {
  if (!localStream) {
    alert("No camera/mic started yet! Can't toggle mic.");
    return;
  }
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    alert("No audio track found.");
    return;
  }
  audioTrack.enabled = !audioTrack.enabled;
  muteButton.textContent = audioTrack.enabled ? "Mute" : "Unmute";
};

/**
 * INVITE MORE button
 * - Prompts for a friend's ID, calls them, adds to multi-party
 */
inviteButton.onclick = () => {
  const newFriendId = prompt("Enter a new friend's ID to invite:");
  if (!newFriendId) return;

  const newCall = peer.call(newFriendId, localStream || null);
  if (!newCall) {
    alert("Could not call the friend. Check ID or your connection.");
    return;
  }
  handleNewCall(newCall);
};

/**
 * CALL FRIEND button
 * - Same logic, uses the friend ID from input
 */
callButton.onclick = () => {
  const friendId = friendIdInput.value.trim();
  if (!friendId) {
    alert("Please enter a friend's ID.");
    return;
  }
  const call = peer.call(friendId, localStream || null);
  if (!call) {
    alert("Call failed. Check the ID or your connection.");
    return;
  }
  handleNewCall(call);
};

/**
 * handleNewCall(call):
 *  - Add call to activeCalls
 *  - Listen for 'stream' event to create video or placeholder
 *  - Manage 'close' event to remove the participant from UI
 */
function handleNewCall(call) {
  activeCalls.push(call);

  call.on("stream", (remoteStream) => {
    // Create container for this participant
    const participantDiv = document.createElement("div");
    participantDiv.classList.add("participant");

    // Create a new video
    const participantVideo = document.createElement("video");
    participantVideo.autoplay = true;
    participantVideo.playsInline = true;
    participantVideo.controls = false;
    participantVideo.style.width = "200px";
    participantVideo.style.margin = "5px";

    const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
    if (hasVideo) {
      participantVideo.srcObject = remoteStream;
      participantDiv.appendChild(participantVideo);
    } else {
      // If no video track, show a placeholder letter
      const placeholder = document.createElement("div");
      placeholder.classList.add("poster");
      placeholder.style.width = "200px";
      placeholder.style.height = "150px";
      placeholder.style.lineHeight = "150px";
      placeholder.textContent = call.peer.charAt(0).toUpperCase();
      participantDiv.appendChild(placeholder);
    }

    participantsContainer.appendChild(participantDiv);
  });

  call.on("close", () => {
    activeCalls = activeCalls.filter((c) => c !== call);
    alert(`Call with ${call.peer} ended.`);

    // Remove that participant’s <video> or placeholder from DOM
    removeParticipantFromDOM(call.peer);
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    alert(`Error with call peer: ${call.peer}`);
  });
}

/**
 * removeParticipantFromDOM(peerId):
 *  - Finds any elements that match the participant's peer ID and removes them
 */
function removeParticipantFromDOM(peerId) {
  const allPosters = participantsContainer.getElementsByClassName("poster");
  const allVideos = participantsContainer.getElementsByTagName("video");

  // Remove any placeholder with matching letter (not perfect if multiple users share first letter)
  for (let i = allPosters.length - 1; i >= 0; i--) {
    const placeholder = allPosters[i];
    if (placeholder.textContent === peerId.charAt(0).toUpperCase()) {
      placeholder.parentElement.remove();
    }
  }

  // Remove any video whose parent might contain the peer's stream
  // This is simpler if you track more data about each participant
  for (let j = allVideos.length - 1; j >= 0; j--) {
    const vid = allVideos[j];
    // Not a perfect check unless you store the peer ID on the element
    // but for now we just remove if it matches the parent's <div> with
    // the same first letter or if we track remoteStream references.
    if (vid.parentElement) {
      vid.parentElement.remove();
    }
  }
}
