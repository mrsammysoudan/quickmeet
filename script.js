/************************************************
 * QuickMeet - Google Meet Style
 *   - On "Start Meeting", auto-join an empty call
 *   - URL automatically changes to ?room=XYZ (the actual peer.id)
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

  /************************************************
   * Check if user is joining an existing room
   ************************************************/
  if (roomIdParam) {
    // This user is a participant (client)
    isHost = false;
    currentRoomId = roomIdParam; // We'll call this ID after peer is open
    initializePeer(); // Let PeerJS assign random ID
  } else {
    // Show the lobby until the user clicks "Start Meeting"
    lobbySection.style.display = "block";
  }

  /************************************************
   * "Start Meeting" Button
   ************************************************/
  startMeetingBtn.onclick = () => {
    isHost = true;
    initializePeer(); // Host's peer.id will be auto-generated
  };

  /************************************************
   * Initialize PeerJS
   ************************************************/
  function initializePeer() {
    // Let PeerJS auto-generate an ID
    peer = new Peer();

    peer.on("open", (actualID) => {
      console.log("Peer open with ID:", actualID);

      // If this user is the host, we update the URL to ?room=<actualID>
      if (isHost) {
        currentRoomId = actualID;

        const newURL = `${location.origin}${
          location.pathname
        }?room=${encodeURIComponent(actualID)}`;
        // Replace the current history entry so the address bar changes
        history.replaceState({}, "", newURL);

        // Display the meeting link in the top bar
        meetingLinkSpan.textContent = newURL;
        meetingInfoBar.style.display = "flex";

        // Show local placeholder letter
        showPlaceholder(actualID);
      }

      // Display the meeting UI
      showMeetingUI();

      // If participant: we have currentRoomId from the URL, call the host now
      if (!isHost && currentRoomId) {
        callHost(currentRoomId);
      }
    });

    // Host/Participant listens for incoming calls
    peer.on("call", (incomingCall) => {
      // Answer with localStream or null if camera not started
      incomingCall.answer(localStream || null);
      handleNewCall(incomingCall);
    });

    // Catch PeerJS errors
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
   * callHost(hostId) - participants call the host
   ************************************************/
  function callHost(hostId) {
    console.log("Attempting to call host ID:", hostId);

    const call = peer.call(hostId, localStream || null);
    if (!call) {
      console.warn("Failed to call host with ID:", hostId);
      alert("Failed to join the meeting. Please try again.");
      return;
    }
    handleNewCall(call);
  }

  /************************************************
   * handleNewCall(call)
   *   - For both host & participants
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
        // Show placeholder letter
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
    // Remove any .poster or <video> from participants whose "first letter" or
    // streaming belongs to that peer. This is just a quick approach.

    const posters = participantsContainer.getElementsByClassName("poster");
    for (let i = posters.length - 1; i >= 0; i--) {
      // We can't easily match by peerId unless we store it explicitly.
      // This approach may remove the wrong placeholder if multiple
      // participants share the same letter. For a robust solution,
      // store references in a map. For now, this is a simple approach.
      posters[i].parentElement.remove();
    }

    const videos = participantsContainer.getElementsByTagName("video");
    for (let j = videos.length - 1; j >= 0; j--) {
      videos[j].parentElement.remove();
    }
  }

  /************************************************
   * Show local placeholder letter
   ************************************************/
  function showPlaceholder(id) {
    localPoster.textContent = getRandomLetter();
    localPoster.style.display = "flex";
    localVideo.style.display = "none";
  }

  /************************************************
   * Generate a random uppercase letter
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

      // Replace placeholder with video
      localPoster.style.display = "none";
      localVideo.srcObject = localStream;
      localVideo.style.display = "block";

      // If we already have calls, we can add the new tracks:
      // (Though typically they'd re-call or re-negotiate)
      // For simplicity, we won't implement dynamic track negotiation here.
    } catch (err) {
      console.warn("Camera/mic not granted:", err);
      alert("Unable to access camera/mic. Using placeholder instead.");
    }
  };

  /************************************************
   * Mute/Unmute Button
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

    // Reload to go back to lobby
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
