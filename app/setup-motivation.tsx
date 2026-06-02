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

export default function SetupMotivation() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();

  const [photo, setPhoto] = useState('');
  const [member, setMember] = useState('');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(15 * 60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user)
      getSettings(user.id).then((s) => {
        setPhoto(s.motivation_photo);
        setMember(s.family_member);
        setMessage(s.family_message);
        setCountdown(s.countdown_seconds);
      });
  }, [user]);

  if (!user) return <Redirect href="/login" />;

  const pickPhoto = async (): Promise<void> => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    await updateSettings(user.id, {
      family_member: member.trim() || 'mama',
      family_message: message.trim(),
      countdown_seconds: countdown,
      motivation_photo: photo,
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
            Add a photo and a message from someone you love. We'll show it on the
            reminder before a gambling or e-wallet app opens — so you remember what
            matters.
          </Text>

          {/* Photo picker */}
          <Pressable
            style={styles.photoCard}
            onPress={pickPhoto}
            android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: false }}
            accessibilityRole="button"
          >
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={styles.photoEmpty}>
                <MaterialCommunityIcons
                  name="image-plus"
                  size={44}
                  color={colors.teal}
                />
                <Text style={styles.photoHint}>tap to choose a photo</Text>
              </View>
            )}
          </Pressable>
          {!!photo && (
            <Text style={styles.changePhoto} onPress={pickPhoto}>
              change photo
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
    photoCard: {
      height: 190,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.outline,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    photo: { width: '100%', height: '100%' },
    photoEmpty: { alignItems: 'center', gap: spacing(1) },
    photoHint: { color: colors.textMuted, fontSize: 13 },
    changePhoto: {
      color: colors.teal,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: spacing(1),
    },
    input: { backgroundColor: colors.surface, marginTop: spacing(1.5) },
  });
