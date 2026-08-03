import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

type HapticTabProps = {
  title: string;
  onPress?: () => void;
};

const HapticTab = ({ title, onPress }: HapticTabProps) => {
  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onPress) {
      onPress();
    }
  };

  return (
    <TouchableOpacity onPress={handlePress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
};

export default HapticTab;
