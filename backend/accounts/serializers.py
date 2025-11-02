from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from .models import User


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    User registration serializer
    """
    password = serializers.CharField(
        write_only=True, 
        min_length=8,
        validators=[validate_password]
    )
    password_confirm = serializers.CharField(write_only=True)
    
    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password_confirm', 'first_name', 'last_name',
                  'phone', 'bio', 'location', 'birth_date', 'website', 'avatar', 'gender','serpapi_key'
        )
        extra_kwargs = {
            # These fields are optional during registration
            'phone': {'required': False},
            'bio': {'required': False},
            'location': {'required': False},
            'birth_date': {'required': False},
            'website': {'required': False},
            'avatar': {'required': False},
            'gender': {'required': False},
            'serpapi_key':{'required':False}
        }
    def validate(self, attrs):
        """
        Validate password confirmation
        """
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("Passwords don't match.")
        return attrs
    
    def validate_email(self, value):
        """
        Validate email uniqueness
        """
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value
    
    def validate_username(self, value):
        """
        Validate username uniqueness
        """
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value
    
    def create(self, validated_data):
        """
        Create new user
        """
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User.objects.create_user(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserLoginSerializer(serializers.Serializer):
    """
    User login serializer
    """
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    
    def validate(self, attrs):
        """
        Validate user credentials
        """
        username = attrs.get('username')
        password = attrs.get('password')
        
        if username and password:
            # Try to authenticate with username first
            user = authenticate(username=username, password=password)
            
            # If username auth fails, try email
            if not user:
                try:
                    user_obj = User.objects.get(email=username)
                    user = authenticate(username=user_obj.username, password=password)
                except User.DoesNotExist:
                    pass
            
            if not user:
                raise serializers.ValidationError('Invalid credentials.')
            
            if not user.is_active:
                raise serializers.ValidationError('User account is disabled.')
                
            attrs['user'] = user
            return attrs
        else:
            raise serializers.ValidationError('Must provide username/email and password.')


class UserProfileSerializer(serializers.ModelSerializer):
    """
    User profile serializer for displaying user info
    """
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name',
                  'is_active', 'created_at', 'updated_at',
                  'phone', 'bio', 'location', 'birth_date', 'website', 'avatar', 'gender'
                  )
        read_only_fields = ('id', 'username', 'is_active', 'created_at', 'updated_at')


class PasswordChangeSerializer(serializers.Serializer):
    """
    Password change serializer
    """
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(
        write_only=True,
        min_length=8,
        validators=[validate_password]
    )
    new_password_confirm = serializers.CharField(write_only=True)
    
    def validate_old_password(self, value):
        """
        Validate old password
        """
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Old password is incorrect.')
        return value
    
    def validate(self, attrs):
        """
        Validate new password confirmation
        """
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError("New passwords don't match.")
        return attrs
    
    def save(self):
        """
        Save new password
        """
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """
    User profile update serializer
    """
    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name', 'phone', 'bio',
                  'location', 'birth_date', 'website', 'avatar', 'gender','serpapi_key')
    
    def validate_email(self, value):
        """
        Validate email uniqueness (exclude current user)
        """
        user = self.context['request'].user
        if User.objects.filter(email=value).exclude(id=user.id).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_phone(self, value):
        """Optional: Add phone number validation"""
        if value and len(value.replace(' ', '').replace('-', '')) < 10:
            raise serializers.ValidationError("Please enter a valid phone number")
        return value