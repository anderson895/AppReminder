import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Redirect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { radius, spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PrimaryButton, OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getSettings, updateSettings } from '../src/db/database';
import { parsePhotos, serializePhotos } from '../src/photos';

export default function SetupMotivation() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();

  const [photos, setPhotos] = useState<string[]>([]);
  const [member, setMember] = useState('');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(15 * 60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user)
      getSettings(user.id).then((s) => {
        setPhotos(parsePhotos(s.motivation_photo));
        setMember(s.family_member);
        setMessage(s.family_message);
        setCountdown(s.countdown_seconds);
      });
  }, [user]);

  if (!user) return <Redirect href="/login" />;

  const addPhotos = async (): Promise<void> => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.7,
    });
    if (!res.canceled) {
      const picked = res.assets.map((a) => a.uri);
      // De-dupe and cap at 6 total.
      setPhotos((prev) => Array.from(new Set([...prev, ...picked])).slice(0, 6));
    }
  };

  const removePhoto = (uri: string) =>
    setPhotos((prev) => prev.filter((u) => u !== uri));

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    await updateSettings(user.id, {
      family_member: member.trim() || 'mama',
      family_message: message.trim(),
      countdown_seconds: countdown,
      motivation_photo: serializePhotos(photos),
    });
    router.replace('/dashboard');
  };

  const inputProps = {
    mode: 'outlined' as const,
    outlineColor: colors.outline,
    activeOutlineColor: colors.teal,
    textColor: colors.text,
    style: styles.input,
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>your reason to pause</Text>
          <Text style={styles.subtitle}>
            Add one or more photos and a message from someone you love. A random
            photo shows on the reminder before a gambling or e-wallet app opens — so
            you remember what matters.
          </Text>

          {/* Photo grid */}
          <View style={styles.grid}>
            {photos.map((uri) => (
              <View key={uri} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => removePhoto(uri)}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {photos.length < 6 && (
              <Pressable
                style={styles.addTile}
                onPress={addPhotos}
                android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: false }}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="image-plus" size={32} color={colors.teal} />
                <Text style={styles.addHint}>add photo</Text>
              </Pressable>
            )}
          </View>
          {photos.length > 0 && (
            <Text style={styles.countHint}>
              {photos.length} photo{photos.length > 1 ? 's' : ''} · one shows at random
            </Text>
          )}

          <TextInput
            {...inputProps}
            label="from (e.g. Mama, my kids)"
            value={member}
            onChangeText={setMember}
          />
          <TextInput
            {...inputProps}
            label="their message to you"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
          />

          <PrimaryButton
            label={busy ? 'saving…' : 'save & continue'}
            onPress={save}
            disabled={busy}
            style={{ marginTop: spacing(2.5) }}
          />
          <OutlineButton
            label="skip for now"
            onPress={() => router.replace('/dashboard')}
            style={{ marginTop: spacing(1.5) }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing(3), paddingBottom: spacing(5) },
    title: { color: colors.text, fontSize: 24, fontWeight: '800' },
    subtitle: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: spacing(1),
      marginBottom: spacing(2.5),
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) },
    thumbWrap: { width: 96, height: 96 },
    thumb: { width: 96, height: 96, borderRadius: radius.md },
    removeBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addTile: {
      width: 96,
      height: 96,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.outline,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing(0.5),
    },
    addHint: { color: colors.textMuted, fontSize: 11 },
    countHint: { color: colors.textFaint, fontSize: 12, marginTop: spacing(1) },
    input: { backgroundColor: colors.surface, marginTop: spacing(1.5) },
  });
