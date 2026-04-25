import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const { height: SCREEN_H } = Dimensions.get("window");
const DRAG_THRESHOLD = 80;

export function BottomSheetModal({ visible, onClose, children }: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      Keyboard.dismiss();
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
      return;
    }

    Animated.timing(slideAnim, {
      toValue: SCREEN_H,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [dragY, slideAnim, visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          dragY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DRAG_THRESHOLD) {
          onClose();
          return;
        }

        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={styles.overlay} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: Animated.add(slideAnim, dragY) }] }]}
        >
          <View style={styles.dragArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={16}>
            <Text style={styles.closeBtnText}>X</Text>
          </Pressable>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1c1d23",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    maxHeight: SCREEN_H * 0.85,
    zIndex: 2,
    elevation: 24,
  },
  dragArea: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#4a4b58",
    borderRadius: 2,
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 20,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  closeBtnText: {
    color: "#72737f",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "600",
  },
});
