/************************************************
 * QuickMeet - Google Meet Style
 *   - Host auto-gets a PeerJS ID -> ?room=thatID
 *   - Participants parse ?room=... to call the host
 *   - Camera is optional; placeholder shown if camera is off
 *   - Mute functionality works without camera
 *   - Immediate media permissions only after joining
 *   - Screen Sharing Fix for Host
 *   - Click to Enlarge Shared Screen
 *   - Local Chat Feature with Real-Time Messaging via Host Relay
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
  const remoteAudioContainer = document.getElementById("remoteAudioContainer"); // Container for remote audios

  const shareScreenBtn = document.getElementById("shareScreenBtn"); // Share Screen Button

  // Chat Elements
  const chatContainer = document.getElementById("chatContainer");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const sendChatBtn = document.getElementById("sendChatBtn");

  // Parse ?room= from URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");

  // App State
  let peer = null; // Our PeerJS instance
  let localStream = null; // Our local media stream
  let cameraVideoTrack = null; // Reference to the camera video track
  let microphoneAudioTrack = null; // Reference to the microphone audio track
  let screenStream = null; // Reference to the screen sharing stream
  let screenVideoTrack = null; // Reference to the screen video track
  let screenAudioTrack = null; // Reference to the screen audio track
  let activeCalls = []; // Keep track of active calls
  let isHost = null; // Determine if user is host
  let currentRoomId = null; // The room ID (host's PeerJS ID)
  let hasCalledHost = false; // Flag to prevent multiple call attempts
  const activePeers = {}; // Track active peers to prevent duplicates
  let isScreenSharing = false; // Flag to track screen sharing state
  let currentAudioTrack = null; // Currently active audio track being sent

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

    // Handle incoming calls (Host Side)
    peer.on("call", (incomingCall) => {
      console.log(
        `[DEBUG] Incoming call from participant ID: ${incomingCall.peer}`
      );

      // Always answer with localStream if we have it, or null if camera wasn't started
      incomingCall.answer(localStream || null);
      console.log(
        `[DEBUG] Answered call from participant ID: ${incomingCall.peer}`
      );

      // Once we get the remote stream...
      incomingCall.on("stream", (remoteStream) => {
        console.log(
          `[DEBUG] Received remote stream from participant ID: ${incomingCall.peer}`
        );

        // Handle remote stream (for audio routing)
        handleRemoteStream(remoteStream, incomingCall.peer); // 🆕

        // Check if the remote side actually has a video track
        const hasVideo =
          remoteStream && remoteStream.getVideoTracks().length > 0;

        console.log(
          `[DEBUG] Participant ID: ${incomingCall.peer} has video: ${hasVideo}`
        );

        if (hasVideo) {
          // Create (or reuse) a container in the videoGrid for this participant
          let participantDiv = document.querySelector(
            `[data-peer-id="${incomingCall.peer}"]`
          );
          if (!participantDiv) {
            participantDiv = document.createElement("div");
            participantDiv.classList.add("video-container", "small"); // Add 'small' class by default
            participantDiv.setAttribute("data-peer-id", incomingCall.peer);
            videoGrid.appendChild(participantDiv);
            console.log(
              `[DEBUG] Created video container for participant ID: ${incomingCall.peer}`
            );
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
          remoteVideo.style.cursor = "pointer"; // Indicate clickable

          // Set default size via CSS classes
          remoteVideo.classList.add("small-video");

          // Add click event to enlarge the video
          remoteVideo.onclick = () => {
            toggleEnlargeVideo(remoteVideo, participantDiv);
          };

          remoteVideo.onloadedmetadata = () => {
            console.log(
              `[DEBUG] Remote video metadata loaded for participant ID: ${incomingCall.peer}`
            );
            remoteVideo
              .play()
              .then(() => {
                console.log(
                  `[DEBUG] Remote video playback started for participant ID: ${incomingCall.peer}`
                );
                console.log(
                  `[DEBUG] Remote video dimensions: width=${remoteVideo.videoWidth}, height=${remoteVideo.videoHeight}`
                );
              })
              .catch((err) => {
                console.error(
                  `[DEBUG] Remote video play error for participant ID: ${incomingCall.peer}:`,
                  err
                );
              });
          };

          // Add an event listener to log video dimensions once the video starts playing
          remoteVideo.addEventListener("playing", () => {
            console.log(
              `[DEBUG] Remote video is playing for participant ID: ${incomingCall.peer}: width=${remoteVideo.videoWidth}, height=${remoteVideo.videoHeight}`
            );
          });

          participantDiv.appendChild(remoteVideo);
        } else {
          // Display a placeholder if no video track
          const placeholder = document.createElement("div");
          placeholder.classList.add("poster");
          placeholder.textContent = incomingCall.peer.charAt(0).toUpperCase(); // Optional: display first letter
          participantDiv.appendChild(placeholder);
          console.log(
            `[DEBUG] Displayed placeholder for participant ID: ${incomingCall.peer}`
          );
        }

        // Add this call to activeCalls and activePeers
        activeCalls.push(incomingCall);
        activePeers[incomingCall.peer] = incomingCall;
        console.log(
          `[DEBUG] Added call with participant ID: ${incomingCall.peer} to activeCalls.`
        );
      });

      // Cleanup if the call ends
      incomingCall.on("close", () => {
        console.log(
          `[DEBUG] Call closed with participant ID: ${incomingCall.peer}`
        );
        removeParticipant(incomingCall.peer);
        removeRemoteAudio(incomingCall.peer); // 🆕 Remove corresponding audio
      });

      // Handle errors
      incomingCall.on("error", (err) => {
        console.error(
          `[DEBUG] Call error with participant ID: ${incomingCall.peer}:`,
          err
        );
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

      // Store the camera video track
      cameraVideoTrack = localStream.getVideoTracks()[0];
      console.log(
        `[DEBUG] Camera video track obtained: label=${cameraVideoTrack.label}, enabled=${cameraVideoTrack.enabled}`
      );

      // Store the microphone audio track
      microphoneAudioTrack = localStream.getAudioTracks()[0];
      console.log(
        `[DEBUG] Microphone audio track obtained: label=${microphoneAudioTrack.label}, enabled=${microphoneAudioTrack.enabled}`
      );

      // Initialize currentAudioTrack to microphoneAudioTrack
      currentAudioTrack = microphoneAudioTrack;
      console.log(
        `[DEBUG] Initialized currentAudioTrack to microphoneAudioTrack.`
      );

      // Log track info for debugging
      localStream.getTracks().forEach((track) => {
        console.log(
          `[DEBUG] local track kind="${track.kind}" label="${track.label}" enabled=${track.enabled}`
        );
      });

      // Show local video
      localVideo.srcObject = localStream;
      localVideo.style.display = "block";
      localPoster.style.display = "none";
      console.log("[DEBUG] Local video displayed.");

      // Add click event to local video for enlargement
      localVideo.onclick = () => {
        toggleEnlargeVideo(localVideo, localBlock);
      };
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
    meetingSection.style.display = "flex"; // Ensure meetingSection is displayed as flex
    chatContainer.style.display = "flex"; // Ensure chatContainer is displayed
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
      handleRemoteStream(remoteStream, call.peer); // 🆕

      // Check if the remote side actually has a video track
      const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;

      console.log("[DEBUG] Remote hasVideo:", hasVideo);

      if (hasVideo) {
        // Create (or reuse) a container in the videoGrid for the host
        let participantDiv = document.querySelector(`[data-peer-id="host"]`);
        if (!participantDiv) {
          participantDiv = document.createElement("div");
          participantDiv.classList.add("video-container", "small"); // Add 'small' class by default
          participantDiv.setAttribute("data-peer-id", "host");
          videoGrid.appendChild(participantDiv);
          console.log(`[DEBUG] Created video container for host.`);
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
        remoteVideo.style.cursor = "pointer"; // Indicate clickable

        // Set default size via CSS classes
        remoteVideo.classList.add("small-video");

        // Add click event to enlarge the video
        remoteVideo.onclick = () => {
          toggleEnlargeVideo(remoteVideo, participantDiv);
        };

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
        console.log(`[DEBUG] Displayed placeholder for host.`);
      }

      // Add this call to activeCalls and activePeers
      activeCalls.push(call);
      activePeers["host"] = call;
      console.log(`[DEBUG] Added call with host to activeCalls.`);
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
    console.log(`[DEBUG] Added host call to activeCalls.`);
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
      console.log("[DEBUG] Local video displayed.");
    } else {
      localVideo.style.display = "none";
      showLocalPlaceholder();
      console.log("[DEBUG] Local video hidden. Placeholder displayed.");
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

    // Toggle the enabled state of the current audio track
    if (currentAudioTrack) {
      currentAudioTrack.enabled = !currentAudioTrack.enabled;
      console.log(`[DEBUG] Audio track enabled: ${currentAudioTrack.enabled}`);

      // Update the mute button icon
      muteBtn.innerHTML = currentAudioTrack.enabled
        ? '<i class="fas fa-microphone"></i>'
        : '<i class="fas fa-microphone-slash"></i>';

      // Inform peers about the audio state
      activeCalls.forEach((call) => {
        const sender = call.peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === "audio");
        if (sender) {
          sender.replaceTrack(currentAudioTrack).catch((err) => {
            console.error(
              `[DEBUG] Error replacing audio track for peer="${call.peer}":`,
              err
            );
          });
        }
      });
    } else {
      console.warn("[DEBUG] No currentAudioTrack to toggle.");
    }
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

    // Stop screen sharing if active
    if (screenStream) {
      console.log("Stopping active screen sharing before leaving.");
      screenStream.getTracks().forEach((track) => track.stop());
      screenStream = null;
      screenVideoTrack = null;
      screenAudioTrack = null;
      isScreenSharing = false;
      currentAudioTrack = microphoneAudioTrack; // Reset to microphone
    }

    // Remove all remote audio elements
    const audioElements = remoteAudioContainer.querySelectorAll("audio");
    audioElements.forEach((audio) => {
      console.log(`Removing audio element: ${audio.id}`);
      audio.srcObject = null;
      audio.remove();
    });

    // Clear chat messages
    chatMessages.innerHTML = "";

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
        console.log("[DEBUG] Meeting link copied to clipboard.");
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
    // Create a new audio element for each remote stream
    const audio = document.createElement("audio");
    audio.id = `remoteAudio-${peerId}`; // Unique ID for each audio element
    audio.srcObject = remoteStream;
    audio.autoplay = true;
    audio.style.display = "none"; // Hide the audio element

    // Append the audio element to the remoteAudioContainer
    remoteAudioContainer.appendChild(audio);
    console.log(`[DEBUG] Added remote audio element for peer: ${peerId}`);

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
    // Function to remove audio element
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
    // Accept specific audio element
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
    if (!localStream) {
      alert("Please start your camera before sharing your screen.");
      return;
    }

    if (isScreenSharing) {
      console.log(
        "[DEBUG] Screen sharing is already active. Attempting to stop."
      );
      await stopScreenShare();
      return;
    }

    // Prompt the user to include audio
    const shareAudio = confirm(
      "Do you want to share your system audio? Click 'OK' to include audio, or 'Cancel' to share without audio."
    );

    try {
      // Capture the screen with optional audio
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: shareAudio,
      });
      console.log("[DEBUG] Screen stream obtained.");

      // Get the screen video track
      screenVideoTrack = screenStream.getVideoTracks()[0];
      console.log(
        `[DEBUG] Screen video track obtained: label=${screenVideoTrack.label}, enabled=${screenVideoTrack.enabled}`
      );

      // Get the screen audio track if audio is shared
      if (shareAudio) {
        const audioTracks = screenStream.getAudioTracks();
        if (audioTracks.length > 0) {
          screenAudioTrack = audioTracks[0];
          console.log(
            `[DEBUG] Screen audio track obtained: label=${screenAudioTrack.label}, enabled=${screenAudioTrack.enabled}`
          );
          currentAudioTrack = screenAudioTrack; // Set current audio track to screen audio
        } else {
          console.warn(
            "[DEBUG] No audio tracks found in screen stream despite requesting audio."
          );
        }
      } else {
        currentAudioTrack = microphoneAudioTrack; // Ensure currentAudioTrack is set to microphone
      }

      // Replace video track in all active calls with screenVideoTrack
      activeCalls.forEach((call) => {
        const videoSender = call.peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");
        if (videoSender) {
          videoSender
            .replaceTrack(screenVideoTrack)
            .then(() => {
              console.log(
                `[DEBUG] Replaced video track with screen share for peer="${call.peer}".`
              );
            })
            .catch((err) => {
              console.error(
                `[DEBUG] Error replacing video track for peer="${call.peer}":`,
                err
              );
            });
        }

        if (shareAudio && screenAudioTrack) {
          const audioSender = call.peerConnection
            .getSenders()
            .find((s) => s.track && s.track.kind === "audio");
          if (audioSender) {
            audioSender
              .replaceTrack(screenAudioTrack)
              .then(() => {
                console.log(
                  `[DEBUG] Replaced audio track with screen audio for peer="${call.peer}".`
                );
              })
              .catch((err) => {
                console.error(
                  `[DEBUG] Error replacing audio track for peer="${call.peer}":`,
                  err
                );
              });
          }
        }
      });

      // Update the local video element to display the screen
      localVideo.srcObject = screenStream;
      console.log("[DEBUG] Local video source updated to screen stream.");

      // Add the 'screen-sharing' class to enlarge the shared screen
      const localBlock = document.getElementById("localBlock");
      if (localBlock) {
        localBlock.classList.add("screen-sharing");
        console.log(
          "[DEBUG] Added 'screen-sharing' class to local video container."
        );
      } else {
        console.warn("[DEBUG] 'localBlock' element not found.");
      }

      // Add 'screen-sharing-active' class to video grid to adjust layout
      videoGrid.classList.add("screen-sharing-active");
      console.log("[DEBUG] Added 'screen-sharing-active' class to video grid.");

      // Listen for the end of screen sharing
      screenVideoTrack.onended = () => {
        console.log("[DEBUG] Screen sharing ended via onended event.");
        stopScreenShare();
      };

      // Change the Share Screen button icon to indicate active sharing
      shareScreenBtn.innerHTML = '<i class="fas fa-stop"></i>';
      shareScreenBtn.title = "Stop Sharing";
      console.log(
        "[DEBUG] Share Screen button updated to 'Stop Sharing' icon."
      );

      // Update screen sharing state
      isScreenSharing = true;
    } catch (err) {
      console.error("[DEBUG] Error sharing the screen:", err);
      alert("Failed to share the screen.");
    }
  };

  /************************************************
   * Function to Stop Screen Sharing
   ************************************************/
  async function stopScreenShare() {
    try {
      if (!screenStream) {
        console.warn("[DEBUG] No active screen sharing to stop.");
        return;
      }

      console.log("[DEBUG] Attempting to stop screen sharing.");

      // Replace screenVideoTrack with cameraVideoTrack in all active calls
      activeCalls.forEach((call) => {
        const videoSender = call.peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");
        if (videoSender && cameraVideoTrack) {
          videoSender
            .replaceTrack(cameraVideoTrack)
            .then(() => {
              console.log(
                `[DEBUG] Replaced screen share track with camera track for peer="${call.peer}".`
              );
            })
            .catch((err) => {
              console.error(
                `[DEBUG] Error replacing camera track for peer="${call.peer}":`,
                err
              );
            });
        }

        if (screenAudioTrack && microphoneAudioTrack) {
          const audioSender = call.peerConnection
            .getSenders()
            .find((s) => s.track && s.track.kind === "audio");
          if (audioSender) {
            audioSender
              .replaceTrack(microphoneAudioTrack)
              .then(() => {
                console.log(
                  `[DEBUG] Replaced screen audio track with microphone track for peer="${call.peer}".`
                );
              })
              .catch((err) => {
                console.error(
                  `[DEBUG] Error replacing microphone track for peer="${call.peer}":`,
                  err
                );
              });
          }
        }
      });

      // Restore the local video element to display the camera
      localVideo.srcObject = localStream;
      console.log("[DEBUG] Local video source restored to camera stream.");

      // Remove the 'screen-sharing' class to return to normal size
      const localBlock = document.getElementById("localBlock");
      if (localBlock) {
        localBlock.classList.remove("screen-sharing");
        console.log(
          "[DEBUG] Removed 'screen-sharing' class from local video container."
        );
      } else {
        console.warn("[DEBUG] 'localBlock' element not found.");
      }

      // Remove 'screen-sharing-active' class from video grid to adjust layout
      videoGrid.classList.remove("screen-sharing-active");
      console.log(
        "[DEBUG] Removed 'screen-sharing-active' class from video grid."
      );

      // Stop all tracks of the screen stream to release resources
      screenStream.getTracks().forEach((track) => track.stop());
      console.log("[DEBUG] Stopped all tracks of the screen stream.");

      // Clear screenStream and screenVideoTrack references
      screenStream = null;
      screenVideoTrack = null;
      screenAudioTrack = null;
      console.log("[DEBUG] Cleared screen stream references.");

      // Change the Share Screen button icon back
      shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
      shareScreenBtn.title = "Share Screen";
      console.log(
        "[DEBUG] Share Screen button updated back to 'Share Screen' icon."
      );

      // Update screen sharing state
      isScreenSharing = false;
      currentAudioTrack = microphoneAudioTrack; // Reset to microphone audio track
      console.log(`[DEBUG] Set currentAudioTrack to microphoneAudioTrack.`);
    } catch (err) {
      console.error("[DEBUG] Error stopping screen share:", err);
      alert("Failed to stop screen sharing.");
    }
  }

  /************************************************
   * Helper Function to Get Video Senders
   ************************************************/
  function getVideoSenders() {
    // Helper to find all video senders in active calls
    const senders = [];
    activeCalls.forEach((call) => {
      const sender = call.peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");
      if (sender) {
        senders.push(sender);
      }
    });
    return senders;
  }

  /************************************************
   * Toggle Enlarge Video Function
   ************************************************/
  function toggleEnlargeVideo(videoElement, participantDiv) {
    if (videoElement.classList.contains("enlarged")) {
      videoElement.classList.remove("enlarged");
      participantDiv.classList.remove("enlarged-container");
      console.log("[DEBUG] Enlarged video minimized.");
    } else {
      // Remove 'enlarged' class from any other videos
      const allVideos = videoGrid.querySelectorAll("video");
      const allContainers = videoGrid.querySelectorAll(".video-container");
      allVideos.forEach((vid) => vid.classList.remove("enlarged"));
      allContainers.forEach((div) =>
        div.classList.remove("enlarged-container")
      );

      // Add 'enlarged' class to the clicked video
      videoElement.classList.add("enlarged");
      participantDiv.classList.add("enlarged-container");
      console.log("[DEBUG] Enlarged video maximized.");
    }
  }

  /************************************************
   * Chat Functionality
   ************************************************/
  // Handle sending chat messages
  sendChatBtn.onclick = () => {
    const message = chatInput.value.trim();
    if (message === "") return;

    // Display the message in the chat area
    appendChatMessage("You", message);
    console.log(`[DEBUG] Sent chat message: "${message}"`);

    // Send the message to all connected peers
    sendMessageToPeers(message);

    // Clear the input field
    chatInput.value = "";
  };

  // Allow sending messages with Enter key
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendChatBtn.click();
    }
  });

  function appendChatMessage(sender, message) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("chat-message");

    const senderSpan = document.createElement("span");
    senderSpan.classList.add("chat-sender");
    senderSpan.textContent = sender + ": ";

    const messageSpan = document.createElement("span");
    messageSpan.classList.add("chat-text");
    messageSpan.textContent = message;

    messageDiv.appendChild(senderSpan);
    messageDiv.appendChild(messageSpan);
    chatMessages.appendChild(messageDiv);

    console.log(`[DEBUG] Appended chat message from "${sender}": "${message}"`);

    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /************************************************
   * Real-Time Chat Functionality (PeerJS Data Connections)
   ************************************************/
  // Initialize an object to hold data connections
  const dataConnections = {};

  /************************************************
   * Establish Data Connections with Peers
   ************************************************/
  function establishDataConnection(peerId) {
    if (dataConnections[peerId]) return; // Already connected

    const conn = peer.connect(peerId);

    conn.on("open", () => {
      console.log(`[DEBUG] Data connection established with peer: ${peerId}`);
    });

    conn.on("data", (data) => {
      console.log(`[DEBUG] Received message from ${peerId}: ${data}`);

      if (isHost) {
        // Host received a message from a participant
        appendChatMessage(`User ${peerId}`, data);

        // Broadcast the message to all other participants
        Object.keys(dataConnections).forEach((id) => {
          if (id !== peerId) {
            dataConnections[id].send(`User ${peerId}: ${data}`);
            console.log(`[DEBUG] Broadcasted message to peer: ${id}`);
          }
        });
      } else {
        // Participant received a message from the host (broadcast)
        appendChatMessage(
          data.split(":")[0],
          data.split(":").slice(1).join(":").trim()
        );
      }
    });

    conn.on("close", () => {
      console.log(`[DEBUG] Data connection closed with peer: ${peerId}`);
      delete dataConnections[peerId];
    });

    conn.on("error", (err) => {
      console.error(`[DEBUG] Data connection error with peer ${peerId}:`, err);
      delete dataConnections[peerId];
    });

    dataConnections[peerId] = conn;
  }

  /************************************************
   * Send Message to All Connected Peers
   ************************************************/
  function sendMessageToPeers(message) {
    if (isHost) {
      // Host broadcasts directly to all connected peers
      Object.values(dataConnections).forEach((conn) => {
        if (conn.open) {
          conn.send(`Host: ${message}`);
          console.log(`[DEBUG] Sent message to peer: ${conn.peer}`);
        }
      });
    } else {
      // Participants send messages to the host only
      const hostConnection = dataConnections[currentRoomId];
      if (hostConnection && hostConnection.open) {
        hostConnection.send(message);
        console.log(`[DEBUG] Sent message to host: ${currentRoomId}`);
      } else {
        console.warn(`[DEBUG] No open connection to host: ${currentRoomId}`);
      }
    }
  }

  /************************************************
   * Handle Incoming Data Connections
   ************************************************/
  peer.on("connection", (conn) => {
    console.log(`[DEBUG] Incoming data connection from peer: ${conn.peer}`);
    establishDataConnection(conn.peer);
  });

  /************************************************
   * Send Data Connections to All Active Peers
   ************************************************/
  function connectDataToPeers() {
    activeCalls.forEach((call) => {
      if (!dataConnections[call.peer]) {
        establishDataConnection(call.peer);
      }
    });
  }

  /************************************************
   * Share Screen Button Enhancements
   ************************************************/
  // Ensure that data connections are established when new calls are made
  peer.on("call", (call) => {
    // Once a new call is established, connect data
    connectDataToPeers();
  });

  /************************************************
   * Final Initialization After All Setups
   ************************************************/
  // After setting up PeerJS and media streams, ensure data connections
  if (isHost) {
    // For host, listen for new participants and establish data connections
    // Assuming that participants will connect via PeerJS calls, data connections are handled in 'call' events
  } else {
    // For participants, establish data connections after calling the host
    if (roomParam) {
      peer.on("open", () => {
        establishDataConnection(roomParam);
      });
    }
  }

  // Additional Cleanup: Remove screen sharing state when leaving
  window.addEventListener("beforeunload", () => {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }
  });
});
