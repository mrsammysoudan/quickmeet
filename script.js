/************************************************
 * QuickMeet - Google Meet Style
 *   - On "Start Meeting", auto-join an empty call
 *   - A link is generated and displayed in the top bar
 *   - Others can join by visiting ?room= that link
 *   - Optional camera, placeholders, mute, leave
 ************************************************/

window.addEventListener("DOMContentLoaded", () => {
  // DOM Refs
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

  const urlParams = new URLSearchParams(window.location.search);
  const roomIdParam = urlParams.get("room");

  let peer; // Our PeerJS instance
  let localStream = null;
  let activeCalls = []; // multi-party tracking
  let isHost = false;
  let currentRoomId = null;

  /************************************************
   * If ?room=someId => auto-join that room
   ************************************************/
  if (roomIdParam) {
    // Join as participant
    currentRoomId = roomIdParam;
    isHost = false;
    initializePeer(); // random ID
  } else {
    // Show the lobby until user clicks "Start Meeting"
    lobbySection.style.display = "block";
  }

  /************************************************
   * "Start Meeting" -> host generates meeting-XXXX
   ************************************************/
  startMeetingBtn.onclick = () => {
    isHost = true;
    currentRoomId = "meeting-" + Math.floor(Math.random() * 100000);
    initializePeer(currentRoomId);
  };

  /************************************************
   * initializePeer(customId?)
   ************************************************/
  function initializePeer(customId) {
    peer = customId ? new Peer(customId) : new Peer();

    peer.on("open", (id) => {
      console.log("Peer open with ID:", id);
      // Show meeting UI
      showMeetingUI();

      if (isHost) {
        const link = `${location.origin}${
          location.pathname
        }?room=${encodeURIComponent(id)}`;
        meetingLinkSpan.textContent = link;
        meetingInfoBar.style.display = "flex";
        showLocalPoster(id);
      } else {
        // participant => call the host
        setTimeout(() => callHost(currentRoomId), 1000);
      }
    });

    peer.on("call", (incomingCall) => {
      incomingCall.answer(localStream || null);
      handleNewCall(incomingCall);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      alert(`PeerJS Error: ${err.type} - ${err.message}`);
    });
  }

  function showMeetingUI() {
    lobbySection.style.display = "none";
    meetingSection.style.display = "block";
  }

  function callHost(roomId) {
    const call = peer.call(roomId, localStream || null);
    if (!call) {
      console.warn("Failed to call host with room ID:", roomId);
      return;
    }
    handleNewCall(call);
  }

  function handleNewCall(call) {
    activeCalls.push(call);

    call.on("stream", (remoteStream) => {
      const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
      const participantDiv = document.createElement("div");
      participantDiv.classList.add("video-container");

      if (hasVideo) {
        const remoteVideo = document.createElement("video");
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.style.width = "320px";
        remoteVideo.style.height = "240px";
        remoteVideo.srcObject = remoteStream;
        participantDiv.appendChild(remoteVideo);
      } else {
        const placeholder = document.createElement("div");
        placeholder.classList.add("poster");
        placeholder.style.display = "flex";
        placeholder.style.justifyContent = "center";
        placeholder.style.alignItems = "center";
        placeholder.textContent = call.peer.charAt(0).toUpperCase();
        participantDiv.appendChild(placeholder);
      }

      participantsContainer.appendChild(participantDiv);
    });

    call.on("close", () => {
      activeCalls = activeCalls.filter((c) => c !== call);
      removeParticipant(call.peer);
    });
  }

  function removeParticipant(peerId) {
    const allPosters = participantsContainer.getElementsByClassName("poster");
    for (let i = allPosters.length - 1; i >= 0; i--) {
      if (allPosters[i].textContent === peerId.charAt(0).toUpperCase()) {
        allPosters[i].parentElement.remove();
      }
    }
    const allVideos = participantsContainer.getElementsByTagName("video");
    for (let j = allVideos.length - 1; j >= 0; j--) {
      allVideos[j].parentElement.remove();
    }
  }

  function showLocalPoster(id) {
    localPoster.textContent = id.charAt(0).toUpperCase();
    localPoster.style.display = "flex";
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
   * Leave Meeting
   ************************************************/
  leaveBtn.onclick = () => {
    // Close all calls
    activeCalls.forEach((c) => c.close());
    activeCalls = [];

    // Destroy our peer
    if (peer && !peer.destroyed) {
      peer.destroy();
    }

    // Stop local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // Return to lobby (or reload)
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
