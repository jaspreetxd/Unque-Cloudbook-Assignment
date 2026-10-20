import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useWebSocket from "../hooks/useWebSocket";

// ─── Helper: extract a named field from Meta field_data array ────────────────
function getField(fieldData = [], name) {
  const item = fieldData.find((f) => f.name === name);
  return item?.values?.[0] ?? "—";
}

// ─── Helper: format unix timestamp ───────────────────────────────────────────
function formatTime(lead) {
  const ts = lead.receivedAt || (lead.created_time && lead.created_time * 1000);
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

// ─── Animated lead card ───────────────────────────────────────────────────────
const LeadCard = React.memo(({ item, isNew }) => {
  const fadeAnim = React.useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const slideAnim = React.useRef(new Animated.Value(isNew ? -30 : 0)).current;

  React.useEffect(() => {
    if (isNew) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          speed: 14,
          bounciness: 6,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isNew]);

  const name = getField(item.field_data, "full_name");
  const email = getField(item.field_data, "email");
  const phone = getField(item.field_data, "phone_number");

  return (
    <Animated.View
      style={[
        styles.card,
        isNew && styles.cardNew,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {isNew && (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>NEW</Text>
        </View>
      )}

      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {name !== "—" ? name[0].toUpperCase() : "?"}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.cardContent}>
        <Text style={styles.leadName}>{name}</Text>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldIcon}>✉️</Text>
          <Text style={styles.fieldValue}>{email}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldIcon}>📱</Text>
          <Text style={styles.fieldValue}>{phone}</Text>
        </View>
        {/* Show any additional fields */}
        {(item.field_data || [])
          .filter(
            (f) =>
              !["full_name", "email", "phone_number"].includes(f.name)
          )
          .map((f) => (
            <View key={f.name} style={styles.fieldRow}>
              <Text style={styles.fieldIcon}>📋</Text>
              <Text style={styles.fieldLabel}>{f.name}: </Text>
              <Text style={styles.fieldValue}>{f.values?.[0] ?? "—"}</Text>
            </View>
          ))}
        <Text style={styles.timestamp}>{formatTime(item)}</Text>
      </View>
    </Animated.View>
  );
});

// ─── Status bar pill ──────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const colors = {
    connected: "#22c55e",
    connecting: "#f59e0b",
    disconnected: "#ef4444",
  };
  const labels = {
    connected: "🟢  Live",
    connecting: "🟡  Connecting…",
    disconnected: "🔴  Disconnected",
  };
  return (
    <View style={[styles.statusPill, { borderColor: colors[status] }]}>
      <Text style={[styles.statusText, { color: colors[status] }]}>
        {labels[status]}
      </Text>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ status }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.emptyTitle}>No leads yet</Text>
      <Text style={styles.emptySubtitle}>
        {status === "connected"
          ? "Submit a test lead via Meta's Lead Testing Tool\nand it will appear here instantly!"
          : "Waiting for connection to backend…"}
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LeadsScreen() {
  const { leads, status, clearLeads } = useWebSocket();
  const insets = useSafeAreaInsets();

  // Track which lead IDs are "new" (arrived after initial load)
  const initialIdsRef = React.useRef(null);
  if (initialIdsRef.current === null && leads.length > 0) {
    initialIdsRef.current = new Set(leads.map((l) => l.id));
  }

  const isNew = useCallback(
    (lead) => {
      if (!initialIdsRef.current) return false;
      return !initialIdsRef.current.has(lead.id);
    },
    [leads]
  );

  const renderItem = useCallback(
    ({ item }) => <LeadCard item={item} isNew={isNew(item)} />,
    [isNew]
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const confirmClear = useCallback(() => {
    Alert.alert(
      "Clear demo leads?",
      "This removes the temporary leads shown in this demo app. Your Meta form and Page are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearLeads();
            } catch (error) {
              Alert.alert("Could not clear leads", "Check that the backend is Live and try again.");
            }
          },
        },
      ]
    );
  }, [clearLeads]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Meta Leads</Text>
          <Text style={styles.headerSub}>
            {leads.length} lead{leads.length !== 1 ? "s" : ""} received
          </Text>
        </View>
        <View style={styles.headerActions}>
          {leads.length > 0 && (
            <Pressable style={styles.clearButton} onPress={confirmClear}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
          )}
          <StatusPill status={status} />
        </View>
      </View>

      {/* List */}
      {status === "connecting" && leads.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Connecting to server…</Text>
        </View>
      ) : (
        <FlatList
          data={leads}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={
            leads.length === 0
              ? styles.flatListEmpty
              : styles.flatListContent
          }
          ListEmptyComponent={<EmptyState status={status} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const PURPLE = "#6366f1";
const DARK_BG = "#0f0f1a";
const CARD_BG = "#1a1a2e";
const CARD_BORDER = "#2d2d4e";
const TEXT_PRIMARY = "#f1f5f9";
const TEXT_SECONDARY = "#94a3b8";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    backgroundColor: DARK_BG,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clearButton: {
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearButtonText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
  },

  // Status pill
  statusPill: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // List
  flatListContent: {
    padding: 16,
    gap: 12,
  },
  flatListEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    flexDirection: "row",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cardNew: {
    borderColor: PURPLE,
    shadowColor: PURPLE,
    shadowOpacity: 0.4,
  },
  newBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: PURPLE,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  // Avatar
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PURPLE,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },

  // Card content
  cardContent: {
    flex: 1,
    gap: 4,
  },
  leadName: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fieldIcon: {
    fontSize: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    textTransform: "capitalize",
  },
  fieldValue: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    flex: 1,
  },
  timestamp: {
    fontSize: 11,
    color: "#475569",
    marginTop: 6,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
  },

  // Empty state
  emptyContainer: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
  },
});
