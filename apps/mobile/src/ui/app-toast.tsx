import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useIsFocused } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

// 화면을 옮겨 가도 남는 알림 띠. 「옷장에서 보기」, 「되돌리기」 같은 단추를 붙인다.
// 옷 넣기처럼 다른 화면에서 끝난 일을 돌아온 화면에 알릴 때 쓴다.
// 시트가 열려 있으면 띠를 화면 위쪽에 그린다. 띠를 띄운 뒤에 시트가 열려도 그릴 때 다시 정한다.
// 띠에서 단추가 아닌 자리는 누름을 아래 화면으로 넘긴다(와이어프레임 pointer-events:none).

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
  /** 화면 아래에서 띄울 거리. 아래 단추가 있는 화면은 그 위로 띄운다. 시트가 열려 있으면 쓰지 않는다. */
  bottom?: number;
}

interface AppToast {
  show: (message: string, actions?: ToastAction[], options?: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<AppToast | null>(null);
/** 열린 시트 하나를 센다. 돌려준 함수를 부르면 센 수에서 뺀다 */
const SheetCountContext = createContext<(() => () => void) | null>(null);

/** 단추가 없으면 2초, 있으면 누를 틈을 주려고 5초 뒤에 사라진다. */
const PLAIN_MS = 2000;
const WITH_ACTIONS_MS = 5000;
/** 하단 탭 위 */
const DEFAULT_BOTTOM = 96;
/** 시트가 열려 있을 때 화면 위에서 띄울 거리(와이어프레임 v26 top 56px) */
const TOP_OVER_SHEET = 56;

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState | null>(null);
  const [openSheets, setOpenSheets] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const countSheet = useCallback(() => {
    setOpenSheets((count) => count + 1);
    let counted = true;
    return () => {
      if (!counted) return;
      counted = false;
      setOpenSheets((count) => count - 1);
    };
  }, []);

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
      <SheetCountContext.Provider value={countSheet}>
        <View style={styles.root}>
          {children}
          {state ? (
            <View
              role="alert"
              pointerEvents="box-none"
              style={[
                styles.toast,
                openSheets > 0 ? { top: TOP_OVER_SHEET } : { bottom: state.bottom },
              ]}
            >
              <View pointerEvents="none" style={styles.textBox}>
                <Text style={styles.text}>{state.message}</Text>
              </View>
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
      </SheetCountContext.Provider>
    </ToastContext.Provider>
  );
}

/**
 * 시트가 이 함수를 부른다. 시트가 열려 있고 그 화면이 앞에 있는 동안 알림 띠를 화면 위쪽에 그린다.
 * 화면이 다른 화면에 가려지면 센 수에서 빠진다. 시트가 그려지기 전에 세어 띠가 한 번도 시트를 덮지 않는다.
 */
export function useToastOverSheet(open: boolean): void {
  const countSheet = useContext(SheetCountContext);
  const focused = useIsFocused();
  useLayoutEffect(
    () => (open && focused && countSheet ? countSheet() : undefined),
    [open, focused, countSheet],
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
  textBox: { flex: 1 },
  text: { color: "#fff", fontSize: 14, lineHeight: 20 },
  action: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
