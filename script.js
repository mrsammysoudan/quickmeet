/************************************************
 * QuickMeet - Google Meet Style
 *   - On "Start Meeting", auto-join an empty call
 *   - URL automatically changes to ?room=XYZ
 *   - Others who visit that link join the same room
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
  const roomIdParam = urlParams.get("room");

  // State Variables
  let peer; // Our PeerJS instance
  let localStream = null;
  let activeCalls = []; // Track multiple calls in multi-party
  let isHost = false;
  let currentRoomId = null;
  let userLetter = ""; // Random letter for placeholder

  /************************************************
   * Initialize based on URL
   ************************************************/
  if (roomIdParam) {
    // User is joining an existing meeting
    isHost = false;
    currentRoomId = roomIdParam;
    initializePeer(); // Random ID for participant
  } else {
    // Show the lobby until user clicks "Start Meeting"
    lobbySection.style.display = "block";
  }

  /************************************************
   * "Start Meeting" Button Click
   ************************************************/
  startMeetingBtn.onclick = () => {
    isHost = true;
    // Initialize Peer without a custom ID; PeerJS assigns a unique ID
    initializePeer();
  };

  /************************************************
   * Initialize PeerJS
   ************************************************/
  function initializePeer(customId = null) {
    peer = customId ? new Peer(customId) : new Peer();

    peer.on("open", (id) => {
      console.log("Peer open with ID:", id);

      if (isHost) {
        // Host: Update the URL with ?room=XYZ
        const newURL = `${location.origin}${
          location.pathname
        }?room=${encodeURIComponent(id)}`;
        history.replaceState({}, "", newURL);

        // Display the meeting link
        meetingLinkSpan.textContent = newURL;
        meetingInfoBar.style.display = "flex";

        // Assign a random letter for the host's placeholder
        userLetter = getRandomLetter();
        showPlaceholder(id);
      }

      // Show the meeting UI
      showMeetingUI();

      if (!isHost) {
        // Participant: Call the host
        callHost(currentRoomId);
      }
    });

    peer.on("call", (incomingCall) => {
      // Answer with localStream (if available) or null
      incomingCall.answer(localStream || null);
      handleNewCall(incomingCall);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      alert(`PeerJS Error: ${err.type} - ${err.message}`);
    });
  }

  /************************************************
   * Show Meeting UI
   ************************************************/
  function showMeetingUI() {
    lobbySection.style.display = "none";
    meetingSection.style.display = "block";
  }

  /************************************************
   * Call Host (for participants)
   ************************************************/
  function callHost(hostId) {
    const call = peer.call(hostId, localStream || null);
    if (!call) {
      console.warn("Failed to call host with room ID:", hostId);
      alert("Failed to join the meeting. Please try again.");
      return;
    }
    handleNewCall(call);
  }

  /************************************************
   * Handle New Call (Both Host and Participant)
   ************************************************/
  function handleNewCall(call) {
    activeCalls.push(call);

    call.on("stream", (remoteStream) => {
      const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
      const participantDiv = document.createElement("div");
      participantDiv.classList.add("video-container");

      if (hasVideo) {
        // Create video element
        const remoteVideo = document.createElement("video");
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.srcObject = remoteStream;
        participantDiv.appendChild(remoteVideo);
      } else {
        // Assign a random letter for the participant
        const participantLetter = getRandomLetter();
        // Show placeholder letter
        const placeholder = document.createElement("div");
        placeholder.classList.add("poster");
        placeholder.textContent = participantLetter;
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
   * Remove Participant from UI
   ************************************************/
  function removeParticipant(peerId) {
    // Remove placeholder
    const allPosters = participantsContainer.getElementsByClassName("poster");
    for (let i = allPosters.length - 1; i >= 0; i--) {
      if (allPosters[i].textContent === peerId.charAt(0).toUpperCase()) {
        allPosters[i].parentElement.remove();
      }
    }

    // Remove video
    const allVideos = participantsContainer.getElementsByTagName("video");
    for (let j = allVideos.length - 1; j >= 0; j--) {
      // Assuming unique video per participant, remove by parent
      allVideos[j].parentElement.remove();
    }
  }

  /************************************************
   * Show Placeholder Letter
   ************************************************/
  function showPlaceholder(id) {
    userLetter = getRandomLetter();
    localPoster.textContent = userLetter;
    localPoster.style.display = "flex";
    localVideo.style.display = "none";
  }

  /************************************************
   * Generate a Random Uppercase Letter
   ************************************************/
  function getRandomLetter() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return letters[Math.floor(Math.random() * letters.length)];
  }

  /************************************************
   * Start Camera Button Click
   ************************************************/
  startCameraBtn.onclick = async () => {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });

      // Replace placeholder with video
      localPoster.style.display = "none";
      localVideo.srcObject = localStream;
      localVideo.style.display = "block";

      // Update all active calls with the new stream
      activeCalls.forEach((call) => {
        call.peerConnection.addTrack(localStream.getTracks()[0], localStream);
      });
    } catch (err) {
      console.warn("Camera/mic not granted:", err);
      alert("Unable to access camera/mic. Using placeholder instead.");
    }
  };

  /************************************************
   * Mute/Unmute Button Click
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
   * Leave Meeting Button Click
   ************************************************/
  leaveBtn.onclick = () => {
    // Close all active calls
    activeCalls.forEach((call) => call.close());
    activeCalls = [];

    // Destroy PeerJS instance
    if (peer && !peer.destroyed) {
      peer.destroy();
    }

    // Stop all local media tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // Reload the page to return to lobby
    location.href = location.origin + location.pathname;
  };

  /************************************************
   * Copy Link Button Click
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
