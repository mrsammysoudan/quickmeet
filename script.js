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

  // App State
  let peer; // Our PeerJS instance
  let localStream = null;
  let activeCalls = []; // Keep track of multiple calls
  let isHost = false;
  let currentRoomId = null;

  /************************************************
   * Decide if user is Host or Participant
   ************************************************/
  if (roomParam) {
    // Check if the host flag is set in sessionStorage
    if (sessionStorage.getItem("isHost") === "true") {
      // This user is the host
      isHost = true;
      currentRoomId = roomParam;
      initializePeer();
    } else {
      // This user is a participant
      isHost = false;
      currentRoomId = roomParam;
      initializePeer();
    }
  } else {
    // Show the lobby until the user clicks "Start Meeting"
    lobbySection.style.display = "block";
  }

  // Host: clicks "Start Meeting"
  startMeetingBtn.onclick = () => {
    isHost = true;
    sessionStorage.setItem("isHost", "true"); // Flag this session as host
    initializePeer();
  };

  /************************************************
   * Initialize PeerJS
   ************************************************/
  function initializePeer() {
    // Let PeerJS auto-assign an ID
    peer = new Peer();

    peer.on("open", (assignedID) => {
      console.log("Peer open with ID:", assignedID);

      if (isHost) {
        // Host: Update the URL with ?room=<hostID>
        currentRoomId = assignedID;
        const newURL = `${location.origin}${
          location.pathname
        }?room=${encodeURIComponent(assignedID)}`;
        history.replaceState({}, "", newURL); // Update the URL without reloading

        // Display the meeting link in the top bar
        meetingLinkSpan.textContent = newURL;
        meetingInfoBar.style.display = "flex";

        // Show placeholder letter for the host
        showLocalPlaceholder();
      }

      // Show the meeting UI
      showMeetingUI();

      // If participant, call the host
      if (!isHost && currentRoomId) {
        callHost(currentRoomId);
      }

      // Request microphone access by default for both host and participants
      requestMicrophoneAccess();
    });

    // Listen for incoming calls
    peer.on("call", (incomingCall) => {
      // Answer with localStream if available, else null
      incomingCall.answer(localStream || null);
      handleNewCall(incomingCall);
    });

    // PeerJS error handling
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
   * Request Microphone Access
   ************************************************/
  async function requestMicrophoneAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // If localStream already exists (from camera), add audio tracks
      if (localStream) {
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach((track) => {
          localStream.addTrack(track);
        });
      } else {
        // Initialize localStream with audio
        localStream = stream;
      }
      // Update local video if stream exists
      if (localStream) {
        localVideo.srcObject = localStream;
      }
    } catch (err) {
      console.warn("Microphone access denied:", err);
      alert("Unable to access microphone. You won't be able to speak.");
    }
  }

  /************************************************
   * Call Host (for participants)
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
   * Handle New Call (Both Host and Participant)
   ************************************************/
  function handleNewCall(call) {
    activeCalls.push(call);

    call.on("stream", (remoteStream) => {
      const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;

      // Create a container for the participant
      const participantDiv = document.createElement("div");
      participantDiv.classList.add("video-container");

      if (hasVideo) {
        // Display remote video
        const remoteVideo = document.createElement("video");
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.srcObject = remoteStream;
        participantDiv.appendChild(remoteVideo);
      } else {
        // Display placeholder letter
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
   * Remove Participant from UI
   ************************************************/
  function removeParticipant(peerId) {
    // For a robust solution, maintain a map of peerId to DOM elements.
    // Here, we'll remove the first matching placeholder or video.
    const posters = participantsContainer.getElementsByClassName("poster");
    for (let i = 0; i < posters.length; i++) {
      // Assuming the placeholder's text corresponds to the participant's letter
      // This is a simplistic approach and may not be unique
      if (posters[i].parentElement) {
        posters[i].parentElement.remove();
        break;
      }
    }

    const videos = participantsContainer.getElementsByTagName("video");
    for (let j = 0; j < videos.length; j++) {
      if (videos[j].parentElement) {
        videos[j].parentElement.remove();
        break;
      }
    }
  }

  /************************************************
   * Show Local Placeholder Letter
   ************************************************/
  function showLocalPlaceholder() {
    localPoster.textContent = getRandomLetter();
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
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false, // Audio already handled separately
      });

      if (localStream) {
        // Add video tracks to existing localStream
        cameraStream.getVideoTracks().forEach((track) => {
          localStream.addTrack(track);
        });
      } else {
        // Initialize localStream with video (and potentially audio)
        localStream = cameraStream;
        // Re-request microphone access to include audio
        await requestMicrophoneAccess();
      }

      // Replace placeholder with video
      localPoster.style.display = "none";
      localVideo.srcObject = localStream;
      localVideo.style.display = "block";
    } catch (err) {
      console.warn("Camera access denied:", err);
      alert("Unable to access camera. Placeholder will remain.");
    }
  };

  /************************************************
   * Mute/Unmute Button Click
   ************************************************/
  muteBtn.onclick = () => {
    if (!localStream) {
      alert("No microphone to mute yet!");
      return;
    }
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      alert("No microphone to mute yet!");
      return;
    }
    const audioTrack = audioTracks[0];
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

    // Reload the page to return to the lobby
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
