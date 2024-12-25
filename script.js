/************************************************
 * QuickMeet - Google Meet Style
 *   - Host auto-gets a PeerJS ID -> ?room=thatID
 *   - Participants parse ?room=... to call the host
 *   - Optional camera, placeholders, mute, leave
 ************************************************/

window.addEventListener("DOMContentLoaded", () => {
  // DOM References
  const startMeetingBtn = document.getElementById("startMeetingBtn");
  const lobbySection = document.getElementById("lobbySection");
  const meetingSection = document.getElementById("meetingSection");

  const meetingInfoBar = document.getElementById("meetingInfoBar");
  const meetingLinkSpan = document.getElementById("meetingLink");
  const copyLinkBtn = document.getElementById("copyLinkBtn");

  const localVideo = document.getElementById("localVideo");
  const localPoster = document.getElementById("localPoster");

  const startCameraBtn = document.getElementById("startCameraBtn");
  const muteBtn = document.getElementById("muteBtn");
  const leaveBtn = document.getElementById("leaveBtn");

  const participantsContainer = document.getElementById("participants");

  // Parse ?room= from URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");

  // State
  let peer; // Our PeerJS instance
  let localStream = null;
  let activeCalls = []; // multiple calls for multi-party
  let isHost = false;
  let currentRoomId = null;

  /************************************************
   * Decide if user is Host or Participant
   ************************************************/
  if (roomParam) {
    // This user is a participant
    isHost = false;
    currentRoomId = roomParam; // The host's ID is this
    initializePeer(); // Let PeerJS assign random ID for participant
  } else {
    // Show the lobby
    lobbySection.style.display = "block";
  }

  // Host: clicks Start Meeting
  startMeetingBtn.onclick = () => {
    isHost = true;
    initializePeer(); // We'll let PeerJS assign a real ID
  };

  /************************************************
   * Initialize PeerJS
   ************************************************/
  function initializePeer() {
    peer = new Peer(); // auto-generate

    peer.on("open", (assignedID) => {
      console.log("Peer open with ID:", assignedID);

      if (isHost) {
        // This user is the host => assignedID is the host’s real ID
        currentRoomId = assignedID;

        // Update the URL with ?room=<hostID>
        const newURL = `${location.origin}${
          location.pathname
        }?room=${encodeURIComponent(assignedID)}`;
        history.replaceState({}, "", newURL);

        // Show meeting link
        meetingLinkSpan.textContent = newURL;
        meetingInfoBar.style.display = "flex";

        // Show local placeholder
        showLocalPlaceholder();
      }

      // Show meeting UI
      lobbySection.style.display = "none";
      meetingSection.style.display = "block";

      // If participant, call the host
      if (!isHost && currentRoomId) {
        callHost(currentRoomId);
      }
    });

    // Listen for calls
    peer.on("call", (incomingCall) => {
      // Answer with localStream or null
      incomingCall.answer(localStream || null);
      handleNewCall(incomingCall);
    });

    // PeerJS errors
    peer.on("error", (err) => {
      console.error("Peer error:", err);
      alert(`PeerJS error: ${err.message}`);
    });
  }

  /************************************************
   * callHost(hostId)
   ************************************************/
  function callHost(hostId) {
    console.log("Attempting to call host ID:", hostId);
    const call = peer.call(hostId, localStream || null);
    if (!call) {
      console.warn("Failed to call host with ID:", hostId);
      alert("Failed to join meeting. Please try again.");
      return;
    }
    handleNewCall(call);
  }

  /************************************************
   * handleNewCall(call)
   ************************************************/
  function handleNewCall(call) {
    activeCalls.push(call);

    call.on("stream", (remoteStream) => {
      const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;

      const participantDiv = document.createElement("div");
      participantDiv.classList.add("video-container");

      if (hasVideo) {
        // Show remote video
        const remoteVideo = document.createElement("video");
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.srcObject = remoteStream;
        participantDiv.appendChild(remoteVideo);
      } else {
        // No video => placeholder letter
        const placeholder = document.createElement("div");
        placeholder.classList.add("poster");
        placeholder.textContent = getRandomLetter();
        participantDiv.appendChild(placeholder);
      }

      participantsContainer.appendChild(participantDiv);
    });

    call.on("close", () => {
      activeCalls = activeCalls.filter((c) => c !== call);
      removeParticipant(call.peer);
    });

    call.on("error", (err) => {
      console.error("Call error:", err);
      alert(`Error with call peer: ${call.peer}`);
    });
  }

  /************************************************
   * removeParticipant(peerId)
   ************************************************/
  function removeParticipant(peerId) {
    // Removes placeholders/videos for the leaving peer
    const posters = participantsContainer.getElementsByClassName("poster");
    while (posters.length > 0) {
      posters[0].parentElement.remove();
    }

    const videos = participantsContainer.getElementsByTagName("video");
    while (videos.length > 0) {
      videos[0].parentElement.remove();
    }
  }

  /************************************************
   * showLocalPlaceholder
   ************************************************/
  function showLocalPlaceholder() {
    localPoster.textContent = getRandomLetter();
    localPoster.style.display = "flex";
    localVideo.style.display = "none";
  }

  /************************************************
   * getRandomLetter
   ************************************************/
  function getRandomLetter() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return letters[Math.floor(Math.random() * letters.length)];
  }

  /************************************************
   * Start Camera
   ************************************************/
  startCameraBtn.onclick = async () => {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });

      localPoster.style.display = "none";
      localVideo.srcObject = localStream;
      localVideo.style.display = "block";
    } catch (err) {
      console.warn("Camera/mic not granted:", err);
      alert("Unable to access camera/mic. Using placeholder instead.");
    }
  };

  /************************************************
   * Mute
   ************************************************/
  muteBtn.onclick = () => {
    if (!localStream) {
      alert("No camera/mic to mute yet!");
      return;
    }
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      alert("No audio track found.");
      return;
    }
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.innerHTML = audioTrack.enabled
      ? '<i class="fas fa-microphone"></i>'
      : '<i class="fas fa-microphone-slash"></i>';
  };

  /************************************************
   * Leave
   ************************************************/
  leaveBtn.onclick = () => {
    // Close calls
    activeCalls.forEach((call) => call.close());
    activeCalls = [];

    // Destroy peer
    if (peer && !peer.destroyed) {
      peer.destroy();
    }

    // Stop local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // Reload => back to lobby
    location.href = location.origin + location.pathname;
  };

  /************************************************
   * Copy Link
   ************************************************/
  copyLinkBtn.onclick = () => {
    const link = meetingLinkSpan.textContent.trim();
    if (!link) return;

    navigator.clipboard
      .writeText(link)
      .then(() => {
        alert("Link copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy link:", err);
      });
  };
});
