/************************************************
 * QuickMeet - Google Meet Style
 *   - Host auto-gets a PeerJS ID -> ?room=thatID
 *   - Participants parse ?room=... to call the host
 *   - Camera is optional; placeholder shown if camera is off
 *   - Mute functionality works without camera
 *   - Immediate media permissions only after joining
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

  const videoGrid = document.getElementById("videoGrid");

  // Parse ?room= from URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");

  // App State
  let peer = null; // Our PeerJS instance
  let localStream = null; // Our local media stream
  let activeCalls = []; // Keep track of active calls
  let isHost = null; // Determine if user is host
  let currentRoomId = null; // The room ID (host's PeerJS ID)
  let hasCalledHost = false; // Flag to prevent multiple call attempts
  const activePeers = {}; // Track active peers to prevent duplicates

  // By default, show the lobby, hide the meeting
  lobbySection.style.display = "block";
  meetingSection.style.display = "none";

  /************************************************
   * Decide if user is joining (participant) or hosting
   ************************************************/
  if (roomParam) {
    // If we have ?room=..., treat this user as a participant
    isHost = false;
    showMeetingUI();
    initializePeer();
  } else {
    // Otherwise, wait until "Start Meeting" to create a host room
    startMeetingBtn.onclick = () => {
      isHost = true;
      showMeetingUI();
      initializePeer();
    };
  }

  /************************************************
   * Initialize PeerJS
   ************************************************/
  function initializePeer() {
    // Provide a config object with an API key or server details if needed:
    // e.g., { host: 'your-peer-server.com', port: 443, secure: true, ... }
    // If using a local PeerJS server, ensure it's running and properly reachable.
    peer = new Peer({
      host: "0.peerjs.com",
      port: 443,
      secure: true,
    });

    peer.on("open", (assignedID) => {
      console.log("PeerJS connection opened. Assigned ID:", assignedID);
      currentRoomId = assignedID;

      if (isHost) {
        // If this user is the host, update the URL with ?room=<peer.id>
        const newURL = `${location.origin}${
          location.pathname
        }?room=${encodeURIComponent(assignedID)}`;
        history.replaceState({}, "", newURL);

        // Display the meeting link in the top bar
        meetingLinkSpan.textContent = newURL;
        meetingInfoBar.style.display = "flex";

        console.log("Host URL updated with room ID:", newURL);

        // Show local placeholder letter (before camera starts)
        showLocalPlaceholder();

        // Request camera/mic after peer is ready
        requestMediaPermissions();
      } else {
        // If user is a participant, just request their camera/mic
        requestMediaPermissions();
      }
    });

    // OLD-STYLE INCOMING CALL LOGIC
    peer.on("call", (incomingCall) => {
      console.log(
        "[DEBUG] Old-style logic: incoming call from:",
        incomingCall.peer
      );

      // Always answer with localStream if we have it, or null if we never started the camera
      incomingCall.answer(localStream || null);

      // Once we get the remote stream...
      incomingCall.on("stream", (remoteStream) => {
        console.log(
          "[DEBUG] Old-style logic: got remote stream from:",
          incomingCall.peer
        );

        // Check if the remote side has a video track
        const hasVideo =
          remoteStream && remoteStream.getVideoTracks().length > 0;

        // Create (or reuse) a container in the videoGrid for this peer
        let participantDiv = document.querySelector(
          `[data-peer-id="${incomingCall.peer}"]`
        );
        if (!participantDiv) {
          participantDiv = document.createElement("div");
          participantDiv.classList.add("video-container");
          participantDiv.setAttribute("data-peer-id", incomingCall.peer);
          videoGrid.appendChild(participantDiv);
        }

        // Clear any existing elements (video/poster) inside participantDiv
        participantDiv.innerHTML = "";

        if (hasVideo) {
          // Show remote video
          const remoteVideo = document.createElement("video");
          remoteVideo.srcObject = remoteStream;
          remoteVideo.autoplay = true;
          remoteVideo.playsInline = true;

          remoteVideo.onloadedmetadata = () => {
            console.log(
              "[DEBUG] Remote video metadata loaded; attempting playback..."
            );
            remoteVideo.play().catch((err) => {
              console.error("[DEBUG] Remote video play error:", err);
            });
          };

          participantDiv.appendChild(remoteVideo);
        } else {
          // Display a placeholder if no video track
          const placeholder = document.createElement("div");
          placeholder.classList.add("poster");
          // Optionally: placeholder.textContent = incomingCall.peer.charAt(0).toUpperCase();
          participantDiv.appendChild(placeholder);
        }
      });

      // Cleanup if the call ends
      incomingCall.on("close", () => {
        console.log(
          "[DEBUG] Old-style logic: call closed with:",
          incomingCall.peer
        );
        removeParticipant(incomingCall.peer);
      });

      // Handle errors
      incomingCall.on("error", (err) => {
        console.error("[DEBUG] Old-style logic: call error:", err);
        alert("Call error with peer " + incomingCall.peer + ": " + err);
        removeParticipant(incomingCall.peer);
      });
    });

    // Handle PeerJS errors
    peer.on("error", (err) => {
      console.error("PeerJS Error:", err);
      alert(`PeerJS Error: ${err.type} - ${err.message}`);
    });
  }

  /************************************************
   * Request Camera and Microphone Permissions
   ************************************************/
  /************************************************
   * Request Camera and Microphone Permissions
   * - Detect mobile devices and customize constraints
   ************************************************/
  async function requestMediaPermissions() {
    // Check if the user is on a mobile device
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    // For mobile devices, specifically request the front-facing camera
    // For desktop, just request a normal camera
    const constraints = isMobile
      ? {
          video: {
            facingMode: "user", // "user" = front cam, "environment" = rear cam
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        }
      : {
          video: true,
          audio: true,
        };

    console.log("[DEBUG] getUserMedia constraints:", constraints);

    try {
      console.log("[DEBUG] Requesting camera and microphone permissions.");
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("[DEBUG] Media permissions granted.");

      // Log track info for debugging
      localStream.getTracks().forEach((track) => {
        console.log(
          `[DEBUG] local track kind="${track.kind}" enabled=${track.enabled}`
        );
      });

      // Show local video
      localVideo.srcObject = localStream;
      localVideo.style.display = "block";
      localPoster.style.display = "none";
    } catch (err) {
      console.warn("[DEBUG] Error accessing camera/microphone:", err);
      alert(
        "Unable to access camera/microphone. You can still join with audio only."
      );
      showLocalPlaceholder(); // Show a placeholder instead of video
    }

    // If participant, attempt to call the host
    if (!isHost && roomParam && !hasCalledHost) {
      console.log("[DEBUG] Participant calling host ID:", roomParam);
      callHost(roomParam);
      hasCalledHost = true;
    }
  }

  /************************************************
   * Show Meeting UI
   ************************************************/
  function showMeetingUI() {
    lobbySection.style.display = "none";
    meetingSection.style.display = "block";
    console.log("Switched to meeting UI.");
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
    console.log(`[DEBUG] handleIncomingCall: from peer="${call.peer}"`);

    if (activePeers[call.peer]) {
      console.warn(
        `[DEBUG] Already connected to peer="${call.peer}". Closing duplicate call.`
      );
      call.close();
      return;
    }

    activeCalls.push(call);
    activePeers[call.peer] = call;

    call.once("stream", (remoteStream) => {
      console.log(`[DEBUG] Received remote stream from peer="${call.peer}"`);
      console.log("[DEBUG] Remote stream tracks:", remoteStream.getTracks());
      remoteStream.getTracks().forEach((t) => {
        console.log(`[DEBUG]  └─ Track kind="${t.kind}" enabled=${t.enabled}`);
      });

      // Now create a <video> or placeholder
      const videoTracks = remoteStream.getVideoTracks();
      console.log(`[DEBUG] Remote has ${videoTracks.length} video track(s).`);

      const participantDiv = document.createElement("div");
      participantDiv.classList.add("video-container");
      participantDiv.setAttribute("data-peer-id", call.peer);

      if (videoTracks.length > 0) {
        const remoteVideo = document.createElement("video");
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.srcObject = remoteStream;

        remoteVideo.onloadedmetadata = () => {
          console.log(
            `[DEBUG] Remote video metadata loaded for peer="${call.peer}". Trying to play.`
          );
          remoteVideo.play().catch((err) => {
            console.error("[DEBUG] Error playing remote video:", err);
          });
        };
        participantDiv.appendChild(remoteVideo);
      } else {
        console.warn(
          `[DEBUG] No video track. Displaying placeholder for peer="${call.peer}"`
        );
        const placeholder = document.createElement("div");
        placeholder.classList.add("poster");
        placeholder.textContent = getRandomLetter();
        participantDiv.appendChild(placeholder);
      }

      videoGrid.appendChild(participantDiv);
    });

    call.once("error", (err) => {
      console.error(`[DEBUG] Call error with peer="${call.peer}":`, err);
    });

    call.once("close", () => {
      console.log(`[DEBUG] Call closed with peer="${call.peer}"`);
      activeCalls = activeCalls.filter((c) => c !== call);
      delete activePeers[call.peer];
      removeParticipant(call.peer);
    });
  }
  /************************************************
   * Remove Participant from UI
   ************************************************/
  function removeParticipant(peerId) {
    console.log("Removing participant with peer ID:", peerId);
    const participantDiv = videoGrid.querySelector(
      `[data-peer-id="${peerId}"]`
    );
    if (participantDiv) {
      videoGrid.removeChild(participantDiv);
      console.log(`Removed participant UI for peer ID: ${peerId}`);
    } else {
      console.warn(`No participant UI found for peer ID: ${peerId}`);
    }
  }

  /************************************************
   * Show Local Placeholder Letter
   ************************************************/
  function showLocalPlaceholder() {
    const letter = getRandomLetter();
    localPoster.textContent = letter;
    localPoster.style.display = "flex";
    localVideo.style.display = "none";
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
   * Show a Join Notification
   ************************************************/
  function showJoinNotification(peerId) {
    const notification = document.createElement("div");
    notification.textContent = `User ${peerId} joined the meeting.`;
    notification.style.position = "fixed";
    notification.style.bottom = "20px";
    notification.style.right = "20px";
    notification.style.backgroundColor = "#4caf50";
    notification.style.color = "#fff";
    notification.style.padding = "8px 12px";
    notification.style.borderRadius = "4px";
    notification.style.zIndex = 9999;

    document.body.appendChild(notification);

    // Remove the notification after 5 seconds
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 5000);
  }

  /************************************************
   * Start Camera (Toggle) Button
   ************************************************/
  startCameraBtn.onclick = () => {
    console.log("[DEBUG] 'Toggle Camera' clicked.");
    if (!localStream) {
      console.warn("[DEBUG] No localStream available when toggling camera.");
      return;
    }
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.warn("[DEBUG] No video tracks found on localStream.");
      return;
    }

    const videoTrack = videoTracks[0];
    videoTrack.enabled = !videoTrack.enabled;
    console.log(`[DEBUG] Video track enabled=${videoTrack.enabled}`);

    // Update the camera button icon
    startCameraBtn.innerHTML = videoTrack.enabled
      ? '<i class="fas fa-video"></i>'
      : '<i class="fas fa-video-slash"></i>';

    // Update track in existing calls
    activeCalls.forEach((call) => {
      call.peerConnection.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === "video") {
          if (videoTrack.enabled) {
            console.log(
              `[DEBUG] Replacing track with enabled video for peer="${call.peer}".`
            );
            sender.replaceTrack(videoTrack);
          } else {
            console.log(
              `[DEBUG] Removing video track for peer="${call.peer}".`
            );
            sender.replaceTrack(null);
          }
        }
      });
    });

    // Show/hide local video
    if (videoTrack.enabled) {
      localVideo.style.display = "block";
      localPoster.style.display = "none";
    } else {
      localVideo.style.display = "none";
      showLocalPlaceholder();
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

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      alert("No audio track found.");
      return;
    }

    // Toggle the enabled state
    audioTracks[0].enabled = !audioTracks[0].enabled;
    console.log(`Audio track enabled: ${audioTracks[0].enabled}`);

    // Update the mute button icon
    muteBtn.innerHTML = audioTracks[0].enabled
      ? '<i class="fas fa-microphone"></i>'
      : '<i class="fas fa-microphone-slash"></i>';
  };

  /************************************************
   * Leave Meeting Button
   ************************************************/
  leaveBtn.onclick = () => {
    console.log("User clicked 'Leave Meeting'. Cleaning up.");

    // Close all active calls
    activeCalls.forEach((call) => {
      console.log(`Closing call with peer: ${call.peer}`);
      call.close();
    });
    activeCalls = [];
    Object.keys(activePeers).forEach((peerId) => delete activePeers[peerId]);

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

    // Reload the page to go back to lobby
    location.href = location.origin + location.pathname;
  };

  /************************************************
   * Copy Link Button
   ************************************************/
  copyLinkBtn.onclick = () => {
    const link = meetingLinkSpan.textContent.trim();
    if (!link) {
      alert("No meeting link to copy.");
      return;
    }

    navigator.clipboard
      .writeText(link)
      .then(() => {
        alert("Meeting link copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy meeting link:", err);
        alert("Failed to copy meeting link.");
      });
  };
});
