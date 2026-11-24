import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

// 화면을 옮겨 가도 남는 알림 띠. 「옷장에서 보기」, 「되돌리기」 같은 단추를 붙인다.
// 옷 넣기처럼 다른 화면에서 끝난 일을 돌아온 화면에 알릴 때 쓴다.

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastState {
  message: string;
  actions: ToastAction[];
  bottom: number;
}

interface ToastOptions {
  /** 화면 아래에서 띄울 거리. 아래 단추가 있는 화면은 그 위로 띄운다. */
  bottom?: number;
}

interface AppToast {
  show: (message: string, actions?: ToastAction[], options?: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<AppToast | null>(null);

/** 단추가 없으면 2초, 있으면 누를 틈을 주려고 5초 뒤에 사라진다. */
const PLAIN_MS = 2000;
const WITH_ACTIONS_MS = 5000;
/** 하단 탭 위 */
const DEFAULT_BOTTOM = 96;

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setState(null);
  }, []);

  const show = useCallback(
    (message: string, actions: ToastAction[] = [], options: ToastOptions = {}) => {
      clearTimeout(timer.current);
      setState({ message, actions, bottom: options.bottom ?? DEFAULT_BOTTOM });
      timer.current = setTimeout(
        () => setState(null),
        actions.length > 0 ? WITH_ACTIONS_MS : PLAIN_MS,
      );
    },
    [],
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {state ? (
          <View role="alert" style={[styles.toast, { bottom: state.bottom }]}>
            <Text style={styles.text}>{state.message}</Text>
            {state.actions.map((action) => (
              <Pressable
                key={action.label}
                role="button"
                hitSlop={8}
                onPress={() => {
                  hide();
                  action.onPress();
                }}
              >
                <Text style={styles.action}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useAppToast(): AppToast {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("AppToastProvider 밖에서 useAppToast 를 불렀다");
  return toast;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#151314",
  },
  text: { flex: 1, color: "#fff", fontSize: 14, lineHeight: 20 },
  action: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
