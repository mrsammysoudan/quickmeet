/************************************************
 * QuickMeet - Google Meet Style
 *   - Host auto-gets a PeerJS ID -> ?room=thatID
 *   - Participants parse URL to call that host ID
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

  // App State
  let peer; // Our PeerJS instance
  let localStream = null;
  let activeCalls = []; // Keep track of multiple calls
  let isHost = false;
  let currentRoomId = null;

  /************************************************
   * Check if user is joining an existing room
   ************************************************/
  if (roomIdParam) {
    // This user is a participant
    isHost = false;
    currentRoomId = roomIdParam;
    initializePeer(); // Random ID for participant
  } else {
    // Show the lobby until "Start Meeting"
    lobbySection.style.display = "block";
  }

  /************************************************
   * "Start Meeting"
   ************************************************/
  startMeetingBtn.onclick = () => {
    isHost = true;
    // Let PeerJS assign a real ID
    initializePeer();
  };

  /************************************************
   * Initialize PeerJS
   ************************************************/
  function initializePeer() {
    // Let PeerJS auto-assign
    peer = new Peer();

    peer.on("open", (actualID) => {
      console.log("Peer open with ID:", actualID);

      // If host, update the URL to ?room=<peer.id>
      if (isHost) {
        currentRoomId = actualID;
        const newURL = `${location.origin}${
          location.pathname
        }?room=${encodeURIComponent(actualID)}`;
        history.replaceState({}, "", newURL);

        // Show meeting link in top bar
        meetingLinkSpan.textContent = newURL;
        meetingInfoBar.style.display = "flex";

        // Show placeholder letter for local user
        showLocalPlaceholder();
      }

      // Show meeting UI
      showMeetingUI();

      // If participant, call the host
      if (!isHost && currentRoomId) {
        callHost(currentRoomId);
      }
    });

    // Listen for incoming calls
    peer.on("call", (incomingCall) => {
      incomingCall.answer(localStream || null);
      handleNewCall(incomingCall);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      alert(`PeerJS error: ${err.message}`);
    });
  }

  /************************************************
   * showMeetingUI
   ************************************************/
  function showMeetingUI() {
    lobbySection.style.display = "none";
    meetingSection.style.display = "block";
  }

  /************************************************
   * callHost(hostId) => participant calls the host
   ************************************************/
  function callHost(hostId) {
    console.log("Attempting to call host ID:", hostId);
    const call = peer.call(hostId, localStream || null);
    if (!call) {
      console.warn("Failed to call host with ID:", hostId);
      alert("Failed to join meeting. Try again.");
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

      // Create a container for each participant
      const participantDiv = document.createElement("div");
      participantDiv.classList.add("video-container");

      if (hasVideo) {
        // Show their video
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
    // Removes that participant's video or placeholder
    // For a robust solution, store a map of peerId -> DOM element.
    // This quick approach removes all placeholders/videos, which
    // might remove the wrong participant if multiple share letters.

    const posters = participantsContainer.getElementsByClassName("poster");
    while (posters.length) {
      posters[0].parentElement.remove();
    }

    const videos = participantsContainer.getElementsByTagName("video");
    while (videos.length) {
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

      // Hide placeholder, show local video
      localPoster.style.display = "none";
      localVideo.srcObject = localStream;
      localVideo.style.display = "block";
    } catch (err) {
      console.warn("Camera/mic not granted:", err);
      alert("Unable to access camera/mic. Using placeholder instead.");
    }
  };

  /************************************************
   * Mute / Unmute
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

    // Reload page => return to lobby
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
