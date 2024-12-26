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
  const remoteAudio = document.getElementById("remoteAudio"); // Hidden audio element

  const shareScreenBtn = document.getElementById("shareScreenBtn"); // 🆕 Share Screen Button

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
    // Use the default PeerJS cloud server
    peer = new Peer({
      host: "0.peerjs.com",
      port: 443,
      secure: true,
    });

    peer.on("open", (assignedID) => {
      console.log("[DEBUG] PeerJS connection opened. Assigned ID:", assignedID);
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

        console.log("[DEBUG] Host URL updated with room ID:", newURL);

        // Show local placeholder letter (before camera starts)
        showLocalPlaceholder();

        // Request camera/mic after peer is ready
        requestMediaPermissions();
      } else {
        // If user is a participant, just request their camera/mic
        requestMediaPermissions();
      }
    });

    // OLD-STYLE LOGIC FOR INCOMING CALLS (Host Side)
    peer.on("call", (incomingCall) => {
      console.log(
        "[DEBUG] Old-style logic: incoming call from:",
        incomingCall.peer
      );

      // Always answer with localStream if we have it, or null if camera wasn't started
      incomingCall.answer(localStream || null);

      // Once we get the remote stream...
      incomingCall.on("stream", (remoteStream) => {
        console.log(
          "[DEBUG] Old-style logic: got remote stream from:",
          incomingCall.peer
        );

        // Handle remote stream (for audio routing)
        handleRemoteStream(remoteStream, incomingCall.peer); // 🆕 Pass peer ID

        // Check if the remote side actually has a video track
        const hasVideo =
          remoteStream && remoteStream.getVideoTracks().length > 0;

        console.log("[DEBUG] Remote hasVideo:", hasVideo);

        if (hasVideo) {
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

          // Show remote video
          const remoteVideo = document.createElement("video");
          remoteVideo.srcObject = remoteStream;
          remoteVideo.autoplay = true;
          remoteVideo.playsInline = true;
          remoteVideo.muted = true; // To allow autoplay on some browsers
          remoteVideo.style.display = "block";

          remoteVideo.onloadedmetadata = () => {
            console.log(
              "[DEBUG] Remote video metadata loaded; attempting playback..."
            );
            remoteVideo
              .play()
              .then(() => {
                console.log("[DEBUG] Remote video playback started.");
                console.log(
                  `[DEBUG] Remote video dimensions: width=${remoteVideo.videoWidth}, height=${remoteVideo.videoHeight}`
                );
              })
              .catch((err) => {
                console.error("[DEBUG] Remote video play error:", err);
              });
          };

          // Add an event listener to log video dimensions once the video starts playing
          remoteVideo.addEventListener("playing", () => {
            console.log(
              `[DEBUG] Remote video is playing: width=${remoteVideo.videoWidth}, height=${remoteVideo.videoHeight}`
            );
          });

          participantDiv.appendChild(remoteVideo);
        } else {
          // Display a placeholder if no video track
          const placeholder = document.createElement("div");
          placeholder.classList.add("poster");
          placeholder.textContent = incomingCall.peer.charAt(0).toUpperCase(); // Optional: display first letter
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
        removeRemoteAudio(incomingCall.peer); // 🆕 Remove corresponding audio
      });

      // Handle errors
      incomingCall.on("error", (err) => {
        console.error("[DEBUG] Old-style logic: call error:", err);
        alert("Call error with peer " + incomingCall.peer + ": " + err);
        removeParticipant(incomingCall.peer);
        removeRemoteAudio(incomingCall.peer); // 🆕 Remove corresponding audio
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

    // Handle events for this call
    call.on("stream", (remoteStream) => {
      console.log(
        "[DEBUG] Participant's own call received remote stream:",
        remoteStream
      );

      // Handle remote stream (for audio routing)
      handleRemoteStream(remoteStream, call.peer); // 🆕 Pass peer ID

      // Check if the remote side actually has a video track
      const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;

      console.log("[DEBUG] Remote hasVideo:", hasVideo);

      if (hasVideo) {
        // Create (or reuse) a container in the videoGrid for the host
        let participantDiv = document.querySelector(`[data-peer-id="host"]`);
        if (!participantDiv) {
          participantDiv = document.createElement("div");
          participantDiv.classList.add("video-container");
          participantDiv.setAttribute("data-peer-id", "host");
          videoGrid.appendChild(participantDiv);
        }

        // Clear any existing elements (video/poster) inside participantDiv
        participantDiv.innerHTML = "";

        // Show remote video
        const remoteVideo = document.createElement("video");
        remoteVideo.srcObject = remoteStream;
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.muted = true; // To allow autoplay on some browsers
        remoteVideo.style.display = "block";

        remoteVideo.onloadedmetadata = () => {
          console.log(
            "[DEBUG] Remote video metadata loaded; attempting playback..."
          );
          remoteVideo
            .play()
            .then(() => {
              console.log("[DEBUG] Remote video playback started.");
              console.log(
                `[DEBUG] Remote video dimensions: width=${remoteVideo.videoWidth}, height=${remoteVideo.videoHeight}`
              );
            })
            .catch((err) => {
              console.error("[DEBUG] Remote video play error:", err);
            });
        };

        // Add an event listener to log video dimensions once the video starts playing
        remoteVideo.addEventListener("playing", () => {
          console.log(
            `[DEBUG] Remote video is playing: width=${remoteVideo.videoWidth}, height=${remoteVideo.videoHeight}`
          );
        });

        participantDiv.appendChild(remoteVideo);
      } else {
        // Display a placeholder if no video track
        const placeholder = document.createElement("div");
        placeholder.classList.add("poster");
        placeholder.textContent = "Host"; // Or any other identifier
        participantDiv.appendChild(placeholder);
      }

      // Optionally, add this peer to activePeers
      activePeers["host"] = call;
      activeCalls.push(call);
    });

    call.on("error", (err) => {
      console.error("[DEBUG] Participant call error:", err);
      alert("Error during call: " + err);
    });

    call.on("close", () => {
      console.log("[DEBUG] Participant call closed with host.");
      // Remove host video
      removeParticipant("host");
      removeRemoteAudio("host"); // 🆕 Remove corresponding audio
    });

    activeCalls.push(call);
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
            sender.replaceTrack(videoTrack).catch((err) => {
              console.error(
                `[DEBUG] Error replacing video track for peer="${call.peer}":`,
                err
              );
            });
          } else {
            console.log(
              `[DEBUG] Removing video track for peer="${call.peer}".`
            );
            sender.replaceTrack(null).catch((err) => {
              console.error(
                `[DEBUG] Error removing video track for peer="${call.peer}":`,
                err
              );
            });
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

    // Optionally, inform peers about the audio state
    activeCalls.forEach((call) => {
      const sender = call.peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === "audio");
      if (sender) {
        if (audioTracks[0].enabled) {
          sender.replaceTrack(audioTracks[0]).catch((err) => {
            console.error(
              `[DEBUG] Error replacing audio track for peer="${call.peer}":`,
              err
            );
          });
        } else {
          sender.replaceTrack(null).catch((err) => {
            console.error(
              `[DEBUG] Error removing audio track for peer="${call.peer}":`,
              err
            );
          });
        }
      }
    });
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

    // Remove all remote audio elements
    const audioElements = document.querySelectorAll("[id^='remoteAudio-']");
    audioElements.forEach((audio) => {
      console.log(`Removing audio element: ${audio.id}`);
      audio.srcObject = null;
      audio.remove();
    });

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

  /************************************************
   * Function to Handle Remote Stream and Audio Routing
   ************************************************/
  async function handleRemoteStream(remoteStream, peerId) {
    // 🆕 Added peerId parameter
    // Create a new audio element for each remote stream
    const audio = document.createElement("audio");
    audio.id = `remoteAudio-${peerId}`; // Unique ID for each audio element
    audio.srcObject = remoteStream;
    audio.autoplay = true;
    audio.style.display = "none"; // Hide the audio element

    // Append the audio element to the body
    document.body.appendChild(audio);

    // Attempt to play the audio
    try {
      await audio.play();
      console.log(`[DEBUG] Remote audio playback started for peer: ${peerId}`);
    } catch (err) {
      console.error(`[DEBUG] Remote audio play error for peer ${peerId}:`, err);
    }

    // Set audio output to speaker if on mobile
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    if (isMobile) {
      await setAudioToSpeaker(audio); // 🆕 Pass the specific audio element
    }
  }

  /************************************************
   * Function to Remove Remote Audio Element
   ************************************************/
  function removeRemoteAudio(peerId) {
    // 🆕 Function to remove audio element
    const audio = document.getElementById(`remoteAudio-${peerId}`);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      console.log(`[DEBUG] Removed audio element for peer: ${peerId}`);
    } else {
      console.warn(`[DEBUG] No audio element found for peer: ${peerId}`);
    }
  }

  /************************************************
   * Function to Set Audio Output to Speaker on Mobile
   ************************************************/
  async function setAudioToSpeaker(audioElement) {
    // 🆕 Accept specific audio element
    if (typeof audioElement.setSinkId !== "undefined") {
      try {
        await audioElement.setSinkId("default");
        console.log("[DEBUG] Audio output set to default speaker.");
      } catch (err) {
        console.error("[DEBUG] Failed to set audio output to speaker:", err);
      }
    } else {
      // Fallback for browsers that do not support setSinkId
      console.warn("[DEBUG] setSinkId not supported in this browser.");
    }
  }

  /************************************************
   * Share Screen Button
   ************************************************/
  shareScreenBtn.onclick = async () => {
    // 🆕 Add event listener
    if (!localStream) {
      alert("Please start your camera before sharing your screen.");
      return;
    }

    // Check if already sharing the screen
    if (
      localStream
        .getVideoTracks()
        .some(
          (track) => track.kind === "video" && track.label.includes("screen")
        )
    ) {
      // Currently sharing screen, so stop sharing
      stopScreenShare();
      return;
    }

    // Prompt the user to include audio
    const shareAudio = confirm(
      "Do you want to share your system audio? Click 'OK' to include audio, or 'Cancel' to share without audio."
    );

    try {
      // Capture the screen with optional audio
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: shareAudio,
      });

      // Get the screen video track
      const screenVideoTrack = screenStream.getVideoTracks()[0];

      // Replace the current video track in localStream with the screen track
      const sender = getVideoSender();
      if (sender) {
        await sender.replaceTrack(screenVideoTrack);
        console.log("[DEBUG] Replaced video track with screen share track.");
      }

      // Update the local video element to display the screen
      localVideo.srcObject = screenStream;

      // Listen for the end of screen sharing
      screenVideoTrack.onended = () => {
        console.log("[DEBUG] Screen sharing ended.");
        stopScreenShare();
      };

      // Change the Share Screen button icon to indicate active sharing
      shareScreenBtn.innerHTML = '<i class="fas fa-stop"></i>';
      shareScreenBtn.title = "Stop Sharing";
    } catch (err) {
      console.error("[DEBUG] Error sharing the screen:", err);
      alert("Failed to share the screen.");
    }
  };

  /************************************************
   * Function to Stop Screen Sharing
   ************************************************/
  async function stopScreenShare() {
    // 🆕 Function to revert back to camera
    try {
      // Get the camera video track
      const cameraVideoTrack = localStream.getVideoTracks()[0];

      // Replace the screen video track with the camera track
      const sender = getVideoSender();
      if (sender) {
        await sender.replaceTrack(cameraVideoTrack);
        console.log("[DEBUG] Replaced screen share track with camera track.");
      }

      // Update the local video element to display the camera
      localVideo.srcObject = localStream;

      // Change the Share Screen button icon back
      shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
      shareScreenBtn.title = "Share Screen";
    } catch (err) {
      console.error("[DEBUG] Error stopping screen share:", err);
      alert("Failed to stop screen sharing.");
    }
  }

  /************************************************
   * Helper Function to Get Video Sender
   ************************************************/
  function getVideoSender() {
    // 🆕 Helper to find the video sender in active calls
    for (let call of activeCalls) {
      let sender = call.peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");
      if (sender) return sender;
    }
    return null;
  }

  // ... [Rest of your existing code remains unchanged] ...
});
