import { trpc } from "@/lib/trpc";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Alert, Button, Image, StyleSheet, View } from "react-native";

interface Props {
  size: number;
  url: string | null;
  onUpload: (filePath: string) => void;
}

export default function Avatar({ url, size = 150, onUpload }: Props) {
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarSize = { height: size, width: size };

  useEffect(() => {
    if (url) downloadImage(url);
  }, [url]);

  const utils = trpc.useUtils();

  async function downloadImage(path: string) {
    try {
      const { signedUrl } = await utils.client.storage.getSignedUrl.query({
        filePath: path,
      });
      setAvatarUrl(signedUrl);
    } catch (error) {
      if (error instanceof Error) {
        console.log("Error downloading image: ", error.message);
      }
    }
  }

  async function uploadAvatar() {
    try {
      setUploading(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, // Restrict to only images
        allowsMultipleSelection: false, // Can only select one image
        allowsEditing: true, // Allows the user to crop / rotate their photo before uploading it
        quality: 1,
        exif: false, // We don't want nor need that data.
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        console.log("User cancelled image picker.");
        return;
      }

      const image = result.assets[0];
      console.log("Got image", image);

      if (!image.uri) {
        throw new Error("No image uri!"); // Realistically, this should never happen, but just in case...
      }

      const fileExt = image.uri?.split(".").pop()?.toLowerCase() ?? "jpeg";
      const fileName = `${Date.now()}.${fileExt}`;
      const fileType = image.mimeType ?? "image/jpeg";

      // Get signed upload URL
      const { signedUrl, path } =
        await utils.client.storage.createSignedUploadUrl.mutate({
          fileName,
          fileType,
        });

      // Upload to the signed URL
      const arraybuffer = await fetch(image.uri).then((res) =>
        res.arrayBuffer(),
      );

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: arraybuffer,
        headers: {
          "Content-Type": fileType,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      onUpload(path);
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert(error.message);
      } else {
        throw error;
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <View>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          accessibilityLabel="Avatar"
          style={[avatarSize, styles.avatar, styles.image]}
        />
      ) : (
        <View style={[avatarSize, styles.avatar, styles.noImage]} />
      )}
      <View>
        <Button
          title={uploading ? "Uploading ..." : "Upload"}
          onPress={uploadAvatar}
          disabled={uploading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: 5,
    overflow: "hidden",
    maxWidth: "100%",
  },
  image: {
    objectFit: "cover",
    paddingTop: 0,
  },
  noImage: {
    backgroundColor: "#333",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgb(200, 200, 200)",
    borderRadius: 5,
  },
});
