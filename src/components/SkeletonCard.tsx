import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';

export function SkeletonCard(): React.JSX.Element {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.shimmer, { transform: [{ translateX }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 120,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  shimmer: {
    width: 120,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
