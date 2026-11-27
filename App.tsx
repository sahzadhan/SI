import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, Alert
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  ExpoSpeechRecognitionModule, useSpeechRecognitionEvent
} from "expo-speech-recognition";
import { API_BASE_URL } from "./src/config";

type Attachment = { uri: string; name: string; mimeType: string; kind: "image" | "pdf" | "document" };
type Message = { id: string; role: "user" | "assistant"; content: string; imageUri?: string };
const starter: Message[] = [{
  id: "welcome", role: "assistant",
  content: "Assalam-o-alaikum! Main Shahzad Intelligence hoon. Voice, PDFs, images, coding aur research mein aapki help kar sakta hoon."
}];

export default function App() {
  const [messages, setMessages] = useState<Message[]>(starter);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(null);

  useSpeechRecognitionEvent("result", event => {
    const transcript = event.results?.[0]?.transcript;
    if (transcript) setDraft(transcript);
  });
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", event => {
    setListening(false);
    Alert.alert("Voice recognition", event.message || "Speech recognition could not start.");
  });

  async function startVoice() {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Microphone permission is needed for voice input.");
        return;
      }
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: false });
    } catch {
      setListening(false);
      Alert.alert("Voice unavailable", "Voice recognition needs a development build with the speech-recognition native module.");
    }
  }

  async function chooseImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: false, quality: 0.85, base64: true
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setAttachment({ uri: a.uri, name: a.fileName || "image.jpg", mimeType: a.mimeType || "image/jpeg", kind: "image" });
    }
  }

  async function choosePdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"], copyToCacheDirectory: true
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setAttachment({ uri: a.uri, name: a.name, mimeType: a.mimeType || "application/pdf", kind: "pdf" });
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if ((!text && !attachment) || busy) return;
    const file = attachment;
    const userMessage: Message = {
      id: String(Date.now()), role: "user",
      content: text || (file?.kind === "pdf" ? `Please analyze this PDF: ${file.name}` : `Please analyze this image: ${file?.name}`),
      imageUri: file?.kind === "image" ? file.uri : undefined
    };
    const next = [...messages, userMessage];
    setMessages(next);
    setDraft("");
    setAttachment(null);
    setBusy(true);

    try {
      let response: Response;
      if (file?.kind === "pdf") {
        const form = new FormData();
        form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as any);
        form.append("question", text || "Summarize this PDF and explain its key points.");
        response = await fetch(`${API_BASE_URL}/api/pdf`, { method: "POST", body: form });
      } else if (file?.kind === "image") {
        const form = new FormData();
        form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as any);
        form.append("question", text || "Describe this image in detail.");
        response = await fetch(`${API_BASE_URL}/api/vision`, { method: "POST", body: form });
      } else {
        response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.filter(m => m.id !== "welcome").map(m => ({ role: m.role, content: m.content }))
          })
        });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");
      setMessages(current => [...current, {
        id: String(Date.now() + 1), role: "assistant", content: data.reply
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection error";
      setMessages(current => [...current, {
        id: String(Date.now() + 1), role: "assistant",
        content: `Issue: ${message}\n\nBackend check karein aur dobara try karein.`
      }]);
    } finally { setBusy(false); }
  }

  async function searchWeb() {
    const q = draft.trim();
    if (!q || busy) return;
    setBusy(true);
    const userMessage: Message = { id: String(Date.now()), role: "user", content: `Search the web: ${q}` };
    setMessages(current => [...current, userMessage]);
    setDraft("");
    try {
      const r = await fetch(`${API_BASE_URL}/api/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Web search failed.");
      setMessages(current => [...current, { id: String(Date.now()+1), role: "assistant", content: d.reply }]);
    } catch (e) {
      setMessages(current => [...current, { id: String(Date.now()+1), role: "assistant", content: e instanceof Error ? e.message : "Search error" }]);
    } finally { setBusy(false); }
  }

  async function editImage() {
    const q = draft.trim();
    if (!attachment || attachment.kind !== "image" || !q || busy) {
      Alert.alert("Image editing", "Pehle image select karein aur batayein kya edit karna hai.");
      return;
    }
    const form = new FormData();
    form.append("image", { uri: attachment.uri, name: attachment.name, type: attachment.mimeType } as any);
    form.append("prompt", q);
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/image-edit`, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Image editing failed.");
      const uri = `data:image/png;base64,${d.image}`;
      setLastGeneratedImage(uri);
      setMessages(current => [...current, { id: String(Date.now()), role: "assistant", content: "Image edit complete. Generated result is shown below." }]);
    } catch (e) {
      Alert.alert("Image editing", e instanceof Error ? e.message : "Could not edit image.");
    } finally { setBusy(false); }
  }

  function speak(text: string) {
    Speech.stop();
    Speech.speak(text, { language: "en", rate: 0.95 });
  }

  function newChat() {
    if (!busy) { setMessages(starter); setLastGeneratedImage(null); }
  }

  return (
    <LinearGradient colors={["#101D35", "#080D18", "#090D16"]} style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#101D35" />
      <View style={styles.glowOne} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <LinearGradient colors={["#8BE7FF", "#658BFF"]} style={styles.logo}><Text style={styles.logoText}>SI</Text></LinearGradient>
            <View>
              <Text style={styles.brand}>SHAHZAD <Text style={styles.brandAccent}>INTELLIGENCE</Text></Text>
              <View style={styles.statusRow}><View style={styles.onlineDot} /><Text style={styles.status}>YOUR PERSONAL AI</Text></View>
            </View>
          </View>
          <Pressable onPress={newChat} style={styles.newChat}><BlurView intensity={35} tint="light" style={styles.newChatBlur}><Text style={styles.plus}>＋</Text></BlurView></Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>YOUR AI WORKSPACE</Text>
          <Text style={styles.heroTitle}>Think bigger.{"\n"}Ask <Text style={styles.heroAccent}>Shahzad.</Text></Text>
          <Text style={styles.heroSub}>Chat, speak, research, read files and create.</Text>
        </View>

        <FlatList
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => (
            <View style={[styles.messageRow, item.role === "user" && styles.userRow]}>
              {item.role === "assistant" && <View style={styles.miniLogo}><Text style={styles.miniLogoText}>SI</Text></View>}
              <View style={[styles.messageBubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
                {item.role === "assistant" ? <BlurView intensity={24} tint="light" style={styles.bubbleBlur}><Text style={styles.messageText}>{item.content}</Text></BlurView> : <Text style={styles.messageText}>{item.content}</Text>}
                {item.role === "assistant" && <Pressable onPress={() => speak(item.content)} style={styles.speakButton}><Text style={styles.speakText}>▶ Listen</Text></Pressable>}
              </View>
              {item.imageUri ? <Image source={{ uri: item.imageUri }} style={styles.inlineImage} /> : null}
            </View>
          )}
          ListFooterComponent={<>
            {busy ? <View style={styles.typing}><ActivityIndicator color="#83DFFF" /><Text style={styles.typingText}>Shahzad is thinking...</Text></View> : null}
            {lastGeneratedImage ? <View style={styles.generated}><Text style={styles.toolTitle}>EDITED IMAGE</Text><Image source={{ uri: lastGeneratedImage }} style={styles.generatedImage} /></View> : null}
          </>}
        />

        <View style={styles.tools}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolScroll}>
            <Pressable style={styles.toolChip} onPress={chooseImage}><Text style={styles.toolIcon}>▧</Text><Text style={styles.toolText}>Image</Text></Pressable>
            <Pressable style={styles.toolChip} onPress={choosePdf}><Text style={styles.toolIcon}>▤</Text><Text style={styles.toolText}>PDF</Text></Pressable>
            <Pressable style={styles.toolChip} onPress={searchWeb}><Text style={styles.toolIcon}>⌕</Text><Text style={styles.toolText}>Web search</Text></Pressable>
            <Pressable style={[styles.toolChip, listening && styles.activeChip]} onPress={listening ? () => ExpoSpeechRecognitionModule.stop() : startVoice}><Text style={styles.toolIcon}>♬</Text><Text style={styles.toolText}>{listening ? "Listening..." : "Voice"}</Text></Pressable>
            <Pressable style={styles.toolChip} onPress={editImage}><Text style={styles.toolIcon}>✧</Text><Text style={styles.toolText}>Edit image</Text></Pressable>
          </ScrollView>
          {attachment ? <View style={styles.attachment}><Text style={styles.attachmentText}>Attached: {attachment.name}</Text><Pressable onPress={() => setAttachment(null)}><Text style={styles.remove}>✕</Text></Pressable></View> : null}
        </View>

        <View style={styles.composerOuter}>
          <BlurView intensity={45} tint="light" style={styles.composer}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Message Shahzad Intelligence..." placeholderTextColor="#91A1B9" style={styles.input} multiline maxLength={6000} editable={!busy} />
            <Pressable onPress={sendMessage} disabled={(!draft.trim() && !attachment) || busy} style={styles.sendWrap}>
              <LinearGradient colors={draft.trim() || attachment ? ["#8BE7FF", "#688CFF"] : ["#536177", "#3C4A60"]} style={styles.sendButton}><Text style={styles.sendIcon}>↑</Text></LinearGradient>
            </Pressable>
          </BlurView>
          <Text style={styles.disclaimer}>AI can make mistakes. Check important information.</Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#080D18"},container:{flex:1,paddingTop:Platform.OS==="android"?12:48},
  glowOne:{position:"absolute",top:100,right:-100,width:260,height:260,borderRadius:130,backgroundColor:"rgba(69,135,255,0.12)"},
  header:{paddingHorizontal:20,paddingVertical:12,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  brandRow:{flexDirection:"row",alignItems:"center",gap:11},logo:{width:43,height:43,borderRadius:15,alignItems:"center",justifyContent:"center"},
  logoText:{color:"#081426",fontSize:16,fontWeight:"900"},brand:{color:"#F4F8FF",fontSize:13,letterSpacing:1.05,fontWeight:"800"},
  brandAccent:{color:"#91DFFF"},statusRow:{flexDirection:"row",alignItems:"center",gap:6,marginTop:5},
  onlineDot:{width:6,height:6,borderRadius:3,backgroundColor:"#54E6B1"},status:{color:"#92A5C2",fontSize:9,letterSpacing:1.6,fontWeight:"700"},
  newChat:{width:42,height:42,borderRadius:15,overflow:"hidden",borderWidth:1,borderColor:"rgba(255,255,255,0.15)"},
  newChatBlur:{flex:1,alignItems:"center",justifyContent:"center"},plus:{color:"white",fontSize:25},
  hero:{paddingHorizontal:23,paddingTop:20,paddingBottom:12},eyebrow:{color:"#82DFFF",fontSize:10,letterSpacing:2.8,fontWeight:"800",marginBottom:9},
  heroTitle:{color:"#F5F8FF",fontSize:32,lineHeight:37,fontWeight:"800"},heroAccent:{color:"#8BDFFF"},
  heroSub:{color:"#9BAAC0",fontSize:12,marginTop:8},chat:{flex:1},chatContent:{paddingHorizontal:18,paddingTop:8,paddingBottom:10,gap:12},
  messageRow:{flexDirection:"row",alignItems:"flex-end",gap:8,maxWidth:"96%"},userRow:{alignSelf:"flex-end",justifyContent:"flex-end"},
  miniLogo:{width:25,height:25,borderRadius:9,backgroundColor:"#25415D",alignItems:"center",justifyContent:"center"},
  miniLogoText:{color:"#A5E8FF",fontSize:9,fontWeight:"900"},messageBubble:{borderRadius:18,overflow:"hidden",maxWidth:"100%"},
  aiBubble:{borderWidth:1,borderColor:"rgba(174,215,255,0.17)",backgroundColor:"rgba(255,255,255,0.055)",borderBottomLeftRadius:5},
  userBubble:{backgroundColor:"#315F9E",borderBottomRightRadius:5,paddingHorizontal:14,paddingVertical:11},
  bubbleBlur:{paddingHorizontal:14,paddingVertical:11},messageText:{color:"#F1F6FF",fontSize:14,lineHeight:21},
  speakButton:{paddingHorizontal:13,paddingBottom:9},speakText:{color:"#8BDFFF",fontSize:10,fontWeight:"700"},
  inlineImage:{width:110,height:110,borderRadius:12},typing:{flexDirection:"row",alignItems:"center",gap:9,paddingLeft:34,paddingVertical:8},
  typingText:{color:"#9EB2CC",fontSize:12},tools:{paddingTop:5},toolScroll:{paddingHorizontal:14,gap:7},
  toolChip:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:12,paddingVertical:9,borderRadius:14,borderWidth:1,borderColor:"rgba(255,255,255,0.15)",backgroundColor:"rgba(255,255,255,0.07)"},
  activeChip:{borderColor:"#83DFFF",backgroundColor:"rgba(80,170,220,0.2)"},toolIcon:{color:"#8BDFFF",fontSize:15},toolText:{color:"#DCEBFF",fontSize:11,fontWeight:"600"},
  attachment:{marginHorizontal:17,marginTop:7,flexDirection:"row",justifyContent:"space-between",padding:8,backgroundColor:"rgba(255,255,255,0.08)",borderRadius:10},
  attachmentText:{color:"#DCEBFF",fontSize:11},remove:{color:"#FF9A9A"},composerOuter:{paddingHorizontal:15,paddingTop:8,paddingBottom:Platform.OS==="android"?13:24},
  composer:{minHeight:58,borderRadius:21,borderWidth:1,borderColor:"rgba(194,225,255,0.23)",flexDirection:"row",alignItems:"center",paddingLeft:16,paddingRight:7,overflow:"hidden",backgroundColor:"rgba(255,255,255,0.07)"},
  input:{flex:1,color:"#F4F8FF",fontSize:13,maxHeight:110,paddingTop:14,paddingBottom:12},sendWrap:{marginLeft:8},
  sendButton:{width:43,height:43,borderRadius:15,alignItems:"center",justifyContent:"center"},sendIcon:{color:"#081426",fontSize:25,fontWeight:"800"},
  disclaimer:{textAlign:"center",color:"#64758F",fontSize:9,marginTop:8},generated:{padding:10,gap:8},
  generatedImage:{width:"100%",height:260,resizeMode:"contain",borderRadius:15},toolTitle:{color:"#8BDFFF",fontWeight:"800",fontSize:10,letterSpacing:2}
});
