// script.js

/**********************************************
 * QuickMeet - Two Flows:
 *   1. Create Meeting -> share link ?room=XYZ
 *   2. Call Friend -> get your ID, friend calls that ID
 *
 * Also supports:
 *   - Optional camera
 *   - Mute button
 *   - Multi-party (host is the "room ID" peer)
 **********************************************/

// DOM References
const createMeetingButton = document.getElementById("createMeetingButton");
const callFriendButton = document.getElementById("callFriendButton");
const meetingLinkContainer = document.getElementById("meetingLinkContainer");
const meetingLinkSpan = document.getElementById("meetingLink");
const callFriendContainer = document.getElementById("callFriendContainer");

const localVideoPoster = document.getElementById("localVideoPoster");
const localVideo = document.getElementById("localVideo");
const startButton = document.getElementById("startButton");
const muteButton = document.getElementById("muteButton");
const inviteButton = document.getElementById("inviteButton"); // optional in this design
const callButton = document.getElementById("callButton");

const myIdDisplay = document.getElementById("my-id");
const friendIdInput = document.getElementById("friend-id");
const friendCallPanel = document.getElementById("friendCallPanel");

const participantsContainer = document.getElementById("participants");

// We parse the URL to see if there's ?room=someId
const urlParams = new URLSearchParams(window.location.search);
const roomIdParam = urlParams.get("room");

// We'll store localStream if the user starts camera
let localStream = null;

// Keep track of active calls for multi-party
let activeCalls = [];

// We'll create a Peer (host or participant).
// If we detect ?room=someId => the user is a participant, get random ID, then calls the host?
// If we create meeting => we become the host with a custom ID
let peer;
let isHost = false;
let currentRoomId = null;

/****************************************************
 * 1) Create Meeting => We'll generate a random room ID,
 *    become the "host" with that ID, show the link.
 ****************************************************/
createMeetingButton.onclick = () => {
  // Generate a custom meeting ID
  // For example, "meeting-" + a random 6-digit number
  currentRoomId = "meeting-" + Math.floor(Math.random() * 1000000);
  isHost = true;

  // Initialize Peer with that custom ID
  peer = new Peer(currentRoomId);

  peer.on("open", (id) => {
    console.log("Host peer open, ID = ", id);
    // Show the meeting link
    const link = `${window.location.origin}${
      window.location.pathname
    }?room=${encodeURIComponent(id)}`;
    meetingLinkSpan.textContent = link;
    meetingLinkSpan.style.cursor = "pointer";
    meetingLinkContainer.style.display = "block";

    // For convenience, hide the startOptions
    document.getElementById("startOptions").style.display = "none";

    // As a host, we also want to see a local placeholder
    showLocalPlaceholder(id);
  });

  peer.on("call", (call) => {
    // We're the host, so we answer with localStream (or null)
    call.answer(localStream || null);
    handleNewCall(call);
  });

  peer.on("error", (err) => {
    console.error("Peer error (host):", err);
    alert("Error creating meeting: " + err);
  });
};

/****************************************************
 * 2) Call Friend => no custom ID. We'll just do new Peer(),
 *    show "Your ID," friend can call that ID.
 ****************************************************/
callFriendButton.onclick = () => {
  peer = new Peer(); // no custom ID => random
  peer.on("open", (id) => {
    console.log("Call-friend mode open, ID = ", id);
    myIdDisplay.textContent = id;
    callFriendContainer.style.display = "block";
    friendCallPanel.style.display = "block";

    // Hide the startOptions
    document.getElementById("startOptions").style.display = "none";

    // Show local placeholder
    showLocalPlaceholder(id);
  });

  peer.on("call", (call) => {
    // answer with localStream or null
    call.answer(localStream || null);
    handleNewCall(call);
  });

  peer.on("error", (err) => {
    console.error("Peer error (call-friend):", err);
    alert("Error in call-friend flow: " + err);
  });
};

/****************************************************
 * If ?room=someId is in URL => auto-join that meeting
 * We'll be a participant with a random ID.
 ****************************************************/
if (roomIdParam) {
  // We are a participant
  isHost = false;
  currentRoomId = roomIdParam;
  peer = new Peer(); // random ID for participant

  peer.on("open", (id) => {
    console.log("Joined meeting as participant, my ID = ", id);

    // Show we joined a meeting
    meetingLinkSpan.textContent = `You joined meeting: ${currentRoomId}`;
    meetingLinkContainer.style.display = "block";
    document.getElementById("startOptions").style.display = "none";

    // Show local placeholder
    showLocalPlaceholder(id);

    // Once we have a peer ID, we call the host's ID
    // But let's wait a sec for us to optionally start camera
    // Or we can do it immediately:
    callHost(currentRoomId);
  });

  peer.on("call", (call) => {
    // Another participant or the host calling us?
    call.answer(localStream || null);
    handleNewCall(call);
  });

  peer.on("error", (err) => {
    console.error("Peer error (participant):", err);
    alert("Error joining meeting: " + err);
  });
}

/****************************************************
 * Helper function: callHost(meetingID)
 * - as a participant, we call the host
 ****************************************************/
function callHost(hostId) {
  // Slight timeout to let user optionally start camera first
  setTimeout(() => {
    const call = peer.call(hostId, localStream || null);
    if (!call) {
      console.error("Could not call host. Maybe host not ready?");
      return;
    }
    handleNewCall(call);
  }, 1000);
}

/****************************************************
 * START CAMERA button
 ****************************************************/
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
    console.warn("User denied camera/mic:", err);
    alert(
      "You can proceed without camera/mic. Calls will be placeholder-only."
    );
  }
};

/****************************************************
 * MUTE BUTTON
 ****************************************************/
muteButton.onclick = () => {
  if (!localStream) {
    alert("No camera/mic started yet!");
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

/****************************************************
 * CALL FRIEND button - from the friendCallPanel
 ****************************************************/
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

/****************************************************
 * handleNewCall(call)
 *  - store in activeCalls
 *  - listen for 'stream' to create video or placeholder
 ****************************************************/
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
      // Show a placeholder letter if no video
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
    removeParticipantFromDOM(call.peer);
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
  });
}

/****************************************************
 * showLocalPlaceholder(id)
 * - shows the local user's first-letter placeholder
 ****************************************************/
function showLocalPlaceholder(id) {
  localVideoPoster.textContent = id.charAt(0).toUpperCase();
  localVideoPoster.style.display = "flex";
}

/****************************************************
 * removeParticipantFromDOM(peerId)
 ****************************************************/
function removeParticipantFromDOM(peerId) {
  // Find any element whose placeholder letter or video belongs to peerId
  const posters = participantsContainer.getElementsByClassName("poster");
  for (let i = posters.length - 1; i >= 0; i--) {
    const ph = posters[i];
    if (ph.textContent === peerId.charAt(0).toUpperCase()) {
      ph.parentElement.remove();
    }
  }

  const videos = participantsContainer.getElementsByTagName("video");
  for (let j = videos.length - 1; j >= 0; j--) {
    const vid = videos[j];
    // Not storing direct references, so we do a simple remove
    // if it's in a .participant div, we remove that entire div
    if (vid.parentElement) {
      // This is a blunt approach—improve if you track each call w/ peerId
      vid.parentElement.remove();
    }
  }
}
