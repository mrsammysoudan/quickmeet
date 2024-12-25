/************************************************
 * QuickMeet - Google Meet Style
 *   - Host auto-gets a PeerJS ID -> ?room=thatID
 *   - Participants parse ?room=... to call the host
 *   - Camera is optional; placeholder shown if camera is off
 *   - Mute functionality works without camera
 *   - Immediate media permissions upon joining
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
  const roomParam = urlParams.get("room"); // e.g., ?room=6edf5051-4b36-464f-9279-d47d8d03ae18

  // App State
  let peer; // Our PeerJS instance
  let localStream = null; // Our local media stream
  let activeCalls = []; // Keep track of active calls
  let isHost = false; // Determine if user is host
  let currentRoomId = null; // The room ID (host's PeerJS ID)

  /************************************************
   * Initialize the Application Based on URL
   ************************************************/
  if (roomParam) {
    // User is a participant
    isHost = false;
    currentRoomId = roomParam;
    console.log(`User is a participant. Room ID: ${currentRoomId}`);
    initializePeer(); // Initialize PeerJS for participant
  } else {
    // User is the host
    console.log("User is the host.");
    lobbySection.style.display = "block"; // Show lobby
  }

  /************************************************
   * "Start Meeting" Button Click Handler (Host)
   ************************************************/
  startMeetingBtn.onclick = () => {
    isHost = true;
    console.log("Host clicked 'Start Meeting'. Initializing PeerJS.");
    initializePeer(); // Initialize PeerJS for host
  };

  /************************************************
   * Initialize PeerJS
   ************************************************/
  function initializePeer() {
    // Create a new PeerJS instance; PeerJS assigns a unique ID automatically
    peer = new Peer();

    peer.on("open", (assignedID) => {
      console.log("PeerJS connection opened. Assigned ID:", assignedID);

      if (isHost) {
        // Host: Update the URL with ?room=<peer.id>
        currentRoomId = assignedID;
        const newURL = `${location.origin}${
          location.pathname
        }?room=${encodeURIComponent(assignedID)}`;
        history.replaceState({}, "", newURL); // Update browser URL without reloading

        console.log("Host URL updated with room ID:", newURL);

        // Display the meeting link in the top bar
        meetingLinkSpan.textContent = newURL;
        meetingInfoBar.style.display = "flex";

        // Show local placeholder letter
        showLocalPlaceholder();
      }

      // Show the meeting UI (hide lobby)
      showMeetingUI();

      // After PeerJS is ready, request media permissions
      requestMediaPermissions();
    });

    // Listen for incoming calls (for both host and participants)
    peer.on("call", (incomingCall) => {
      console.log("Incoming call from:", incomingCall.peer);
      // Answer the call with our local stream (if available)
      incomingCall.answer(localStream || null);
      handleIncomingCall(incomingCall);
    });

    // Listen for PeerJS errors
    peer.on("error", (err) => {
      console.error("PeerJS Error:", err);
      alert(`PeerJS Error: ${err.type} - ${err.message}`);
    });
  }

  /************************************************
   * Request Camera and Microphone Permissions
   ************************************************/
  async function requestMediaPermissions() {
    try {
      console.log("Requesting camera and microphone permissions.");
      // Request both video and audio permissions
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true, // Video is optional; users can disable it later
        audio: true, // Audio is required for mute functionality
      });

      console.log("Media permissions granted.");

      // If media permissions are granted, display the local video
      if (localStream) {
        localVideo.srcObject = localStream;
        localVideo.style.display = "block"; // Show video
        localPoster.style.display = "none"; // Hide placeholder
      }
    } catch (err) {
      console.warn("Camera/Microphone access denied or not available:", err);
      alert(
        "Unable to access camera/microphone. You can join with audio only."
      );

      // Show placeholder since no video is available
      showLocalPlaceholder();
    }

    // If the user is a participant and has a room ID, attempt to call the host after media permissions are handled
    if (!isHost && currentRoomId) {
      console.log("Participant attempting to call host ID:", currentRoomId);
      callHost(currentRoomId);
    }
  }

  /************************************************
   * Show Meeting UI
   ************************************************/
  function showMeetingUI() {
    lobbySection.style.display = "none"; // Hide lobby
    meetingSection.style.display = "block"; // Show meeting UI
    console.log("Meeting UI is now visible.");
  }

  /************************************************
   * Call Host (For Participants)
   ************************************************/
  function callHost(hostId) {
    console.log("Attempting to call host ID:", hostId);
    const call = peer.call(hostId, localStream || null);

    if (!call) {
      console.warn("Failed to call host with ID:", hostId);
      alert("Failed to join the meeting. Please try again.");
      return;
    }

    handleIncomingCall(call);
  }

  /************************************************
   * Handle Incoming Call (Both Host and Participant)
   ************************************************/
  function handleIncomingCall(call) {
    console.log("Handling incoming call from:", call.peer);
    activeCalls.push(call);

    call.on("stream", (remoteStream) => {
      console.log("Received remote stream from:", call.peer);
      const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;

      // Create a container for the participant
      const participantDiv = document.createElement("div");
      participantDiv.classList.add("video-container");

      if (hasVideo) {
        // If the participant has video, display it
        const remoteVideo = document.createElement("video");
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.srcObject = remoteStream;
        participantDiv.appendChild(remoteVideo);
        console.log(`Displaying video stream from peer: ${call.peer}`);
      } else {
        // If no video, display a placeholder letter
        const placeholder = document.createElement("div");
        placeholder.classList.add("poster");
        placeholder.textContent = getRandomLetter();
        participantDiv.appendChild(placeholder);
        console.log(`Displaying placeholder for peer: ${call.peer}`);
      }

      participantsContainer.appendChild(participantDiv);
    });

    call.on("close", () => {
      console.log("Call with peer", call.peer, "has been closed.");
      activeCalls = activeCalls.filter((c) => c !== call);
      removeParticipant(call.peer);
    });

    call.on("error", (err) => {
      console.error("Call Error with peer", call.peer, ":", err);
      alert(`Error with call peer: ${call.peer}`);
    });
  }

  /************************************************
   * Remove Participant from UI
   ************************************************/
  function removeParticipant(peerId) {
    console.log("Removing participant with peer ID:", peerId);

    // Remove placeholders
    const posters = participantsContainer.getElementsByClassName("poster");
    for (let i = posters.length - 1; i >= 0; i--) {
      const poster = posters[i];
      const parent = poster.parentElement;
      if (parent) {
        parent.remove();
        console.log(`Removed placeholder for peer ID: ${peerId}`);
      }
    }

    // Remove videos
    const videos = participantsContainer.getElementsByTagName("video");
    for (let j = videos.length - 1; j >= 0; j--) {
      const video = videos[j];
      const parent = video.parentElement;
      if (parent) {
        parent.remove();
        console.log(`Removed video for peer ID: ${peerId}`);
      }
    }
  }

  /************************************************
   * Show Local Placeholder Letter
   ************************************************/
  function showLocalPlaceholder() {
    const letter = getRandomLetter();
    localPoster.textContent = letter;
    localPoster.style.display = "flex"; // Show placeholder
    localVideo.style.display = "none"; // Hide video
    console.log(`Displayed local placeholder with letter: ${letter}`);
  }

  /************************************************
   * Generate a Random Uppercase Letter
   ************************************************/
  function getRandomLetter() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return letters[Math.floor(Math.random() * letters.length)];
  }

  /************************************************
   * Start Camera Button Click Handler
   ************************************************/
  startCameraBtn.onclick = async () => {
    try {
      console.log(
        "User clicked 'Start Camera'. Requesting camera permissions."
      );
      // Request camera and microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });

      console.log("Camera and microphone permissions granted.");

      // If we already have a localStream, add the new video track
      if (localStream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          localStream.addTrack(videoTrack);
          console.log("Added new video track to localStream.");

          // Update the local video element to show the stream
          localVideo.srcObject = localStream;
          localVideo.style.display = "block"; // Show video
          localPoster.style.display = "none"; // Hide placeholder

          // Update all active calls with the new stream
          activeCalls.forEach((call) => {
            call.peerConnection.getSenders().forEach((sender) => {
              if (sender.track.kind === "video") {
                sender.replaceTrack(videoTrack);
                console.log(
                  `Replaced video track for call with peer: ${call.peer}`
                );
              }
            });
          });
        }
      } else {
        // If localStream was null, set it to the new stream
        localStream = stream;
        localVideo.srcObject = localStream;
        localVideo.style.display = "block"; // Show video
        localPoster.style.display = "none"; // Hide placeholder

        console.log("Set localStream with new media stream.");

        // If participant, ensure the host is called with the updated stream
        if (!isHost && currentRoomId) {
          console.log(
            "Participant has updated localStream. Attempting to call host again."
          );
          callHost(currentRoomId);
        }
      }
    } catch (err) {
      console.warn("Unable to access camera/mic:", err);
      alert("Unable to access camera/mic. You can continue with audio only.");

      // Show placeholder since no video is available
      showLocalPlaceholder();
    }
  };

  /************************************************
   * Mute/Unmute Button Click Handler
   ************************************************/
  muteBtn.onclick = () => {
    if (!localStream) {
      alert("No camera/mic to mute yet!");
      console.warn("Mute attempted without localStream.");
      return;
    }

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      alert("No audio track found.");
      console.warn("Mute attempted without audio tracks.");
      return;
    }

    // Toggle the enabled state of the first audio track
    audioTracks[0].enabled = !audioTracks[0].enabled;
    console.log(`Audio track enabled: ${audioTracks[0].enabled}`);

    // Update the mute button icon based on the current state
    if (audioTracks[0].enabled) {
      muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
      console.log("Microphone unmuted.");
    } else {
      muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
      console.log("Microphone muted.");
    }
  };

  /************************************************
   * Leave Meeting Button Click Handler
   ************************************************/
  leaveBtn.onclick = () => {
    console.log("User clicked 'Leave Meeting'. Cleaning up.");

    // Close all active calls
    activeCalls.forEach((call) => {
      console.log(`Closing call with peer: ${call.peer}`);
      call.close();
    });
    activeCalls = [];

    // Destroy PeerJS instance
    if (peer && !peer.destroyed) {
      console.log("Destroying PeerJS instance.");
      peer.destroy();
    }

    // Stop all local media tracks
    if (localStream) {
      console.log("Stopping all local media tracks.");
      localStream.getTracks().forEach((track) => track.stop());
    }

    // Reload the page to return to the lobby
    console.log("Reloading the page to return to the lobby.");
    location.href = location.origin + location.pathname;
  };

  /************************************************
   * Copy Link Button Click Handler
   ************************************************/
  copyLinkBtn.onclick = () => {
    const link = meetingLinkSpan.textContent.trim();
    if (!link) {
      alert("No meeting link to copy.");
      console.warn("Copy Link attempted without a valid link.");
      return;
    }

    navigator.clipboard
      .writeText(link)
      .then(() => {
        alert("Meeting link copied to clipboard!");
        console.log("Copied meeting link to clipboard:", link);
      })
      .catch((err) => {
        console.error("Failed to copy meeting link:", err);
        alert("Failed to copy meeting link.");
      });
  };
});
